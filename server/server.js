import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cors from "cors";
import { parse as parseCsv } from "csv-parse/sync";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import XLSX from "xlsx";
import { initDb } from "./db.js";

dotenv.config();

const app = express();
const db = await initDb();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://127.0.0.1:5173";
const TOKEN_TTL_SECONDS = 10 * 60;

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

function signToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { sub: user.id, email: user.email, jti },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS },
  );
  return { token, expiresIn: TOKEN_TTL_SECONDS };
}

function normalize(value) {
  return String(value || "").trim();
}

function normalizeHeader(header) {
  return normalize(header).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isMobile(value) {
  return /^[0-9+\-\s]{7,15}$/.test(value);
}

function numberValue(value) {
  const parsed = Number(String(value || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      return res.status(401).json({ message: "Missing authorization token." });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const revoked = await db.get(
      "SELECT jti FROM revoked_tokens WHERE jti = ?",
      decoded.jti,
    );
    if (revoked) {
      return res.status(401).json({ message: "Token has been logged out." });
    }

    const user = await db.get(
      "SELECT id, name, email, mobile FROM users WHERE id = ?",
      decoded.sub,
    );
    if (!user) {
      return res.status(401).json({ message: "User no longer exists." });
    }

    req.user = user;
    req.tokenPayload = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
  }
}

function parseBuyerFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".csv") {
    return parseCsv(file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  }

  if ([".xls", ".xlsx"].includes(ext)) {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  }

  const error = new Error("Only .csv, .xls, and .xlsx files are supported.");
  error.status = 400;
  throw error;
}

function normalizeBuyerRow(row, index) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = value;
  }

  const buyer = {
    name: normalize(normalized.name),
    email: normalize(normalized.email).toLowerCase(),
    mobile: normalize(normalized.mobile),
    address: normalize(normalized.address),
    totalInvoiceAmount: numberValue(normalized.totalinvoiceamount),
    totalAmountPaid: numberValue(normalized.totalamountpaid),
    totalAmountDue: numberValue(normalized.totalamountdue),
  };

  if (!buyer.name || !isEmail(buyer.email) || !isMobile(buyer.mobile)) {
    throw new Error(
      `Row ${index + 2} must include valid Name, Email, and Mobile values.`,
    );
  }

  return buyer;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/signup", async (req, res) => {
  const name = normalize(req.body.name);
  const email = normalize(req.body.email).toLowerCase();
  const mobile = normalize(req.body.mobile);
  const password = String(req.body.password || "");

  if (!name || !isEmail(email) || !isMobile(mobile) || password.length < 6) {
    return res.status(400).json({
      message:
        "Name, valid email, valid mobile, and password with at least 6 characters are required.",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await db.run(
      "INSERT INTO users (name, email, mobile, password_hash) VALUES (?, ?, ?, ?)",
      name,
      email,
      mobile,
      passwordHash,
    );
    const user = { id: result.lastID, name, email, mobile };
    res.status(201).json({ user, ...signToken(user) });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res
        .status(409)
        .json({ message: "Email or mobile number already exists." });
    }
    res.status(500).json({ message: "Unable to create account." });
  }
});

app.post("/api/auth/signin", async (req, res) => {
  const login = normalize(req.body.login).toLowerCase();
  const password = String(req.body.password || "");

  const user = await db.get(
    "SELECT * FROM users WHERE lower(email) = ? OR mobile = ?",
    login,
    login,
  );
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: "Invalid login credentials." });
  }

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
    },
    ...signToken(user),
  });
});

app.post("/api/auth/refresh", authenticate, (req, res) => {
  res.json(signToken(req.user));
});

app.post("/api/auth/logout", authenticate, async (req, res) => {
  await db.run(
    "INSERT OR REPLACE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)",
    req.tokenPayload.jti,
    req.tokenPayload.exp || Math.floor(Date.now() / 1000),
  );
  res.json({ message: "Logged out successfully." });
});

app.post("/api/buyers/upload", authenticate, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Please attach a CSV or Excel file." });
  }

  try {
    const rows = parseBuyerFile(req.file);
    if (!rows.length) {
      return res.status(400).json({ message: "The uploaded file is empty." });
    }

    const buyers = rows.map(normalizeBuyerRow);
    await db.exec("BEGIN TRANSACTION");
    try {
      for (const buyer of buyers) {
        await db.run(
          `INSERT INTO buyers (
            uploaded_by, name, email, mobile, address,
            total_invoice_amount, total_amount_paid, total_amount_due
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          req.user.id,
          buyer.name,
          buyer.email,
          buyer.mobile,
          buyer.address,
          buyer.totalInvoiceAmount,
          buyer.totalAmountPaid,
          buyer.totalAmountDue,
        );
      }
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }

    res.status(201).json({ inserted: buyers.length });
  } catch (error) {
    res.status(error.status || 400).json({
      message: error.message || "Unable to process uploaded file.",
    });
  }
});

app.get("/api/buyers", authenticate, async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 5), 50);
  const offset = (page - 1) * limit;
  const search = normalize(req.query.search).toLowerCase();
  const like = `%${search}%`;

  const where = search
    ? "uploaded_by = ? AND (lower(name) LIKE ? OR lower(email) LIKE ? OR mobile LIKE ?)"
    : "uploaded_by = ?";
  const params = search ? [req.user.id, like, like, like] : [req.user.id];

  const totalRow = await db.get(
    `SELECT COUNT(*) AS total FROM buyers WHERE ${where}`,
    ...params,
  );
  const buyers = await db.all(
    `SELECT id, name, email, mobile, address,
      total_invoice_amount AS totalInvoiceAmount,
      total_amount_paid AS totalAmountPaid,
      total_amount_due AS totalAmountDue,
      created_at AS createdAt
     FROM buyers
     WHERE ${where}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );

  res.json({
    buyers,
    page,
    limit,
    total: totalRow.total,
    totalPages: Math.ceil(totalRow.total / limit) || 1,
  });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../client/dist");
app.use(express.static(distDir));
app.get(/.*/, (_req, res, next) => {
  res.sendFile(path.join(distDir, "index.html"), (error) => {
    if (error) next();
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ message: error.message });
  }
  res.status(500).json({ message: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`Buyer Management Portal API running on http://localhost:${PORT}`);
});
