import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function currency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export default function App() {
  const [authMode, setAuthMode] = useState("signin");
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    mobile: "",
    login: "",
    password: "",
  });
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [buyers, setBuyers] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

  useEffect(() => {
    if (!token) return;
    loadBuyers();
  }, [token, page]);

  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      setPage(1);
      loadBuyers(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  async function api(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }
    return data;
  }

  function storeSession(data) {
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
  }

  async function submitAuth(event) {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const path = authMode === "signin" ? "/auth/signin" : "/auth/signup";
      const body =
        authMode === "signin"
          ? { login: authForm.login, password: authForm.password }
          : {
              name: authForm.name,
              email: authForm.email,
              mobile: authForm.mobile,
              password: authForm.password,
            };
      const data = await api(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      storeSession(data);
      setMessage("Signed in successfully.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadBuyers(nextPage = page) {
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: "10",
        search,
      });
      const data = await api(`/buyers?${params}`, { headers });
      setBuyers(data.buyers);
      setTotalPages(data.totalPages);
    } catch (error) {
      setMessage(error.message);
      if (error.message.toLowerCase().includes("token")) {
        signOut(false);
      }
    }
  }

  async function uploadFile(event) {
    event.preventDefault();
    if (!file) {
      setMessage("Choose a CSV or Excel file first.");
      return;
    }

    setLoading(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/buyers/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Upload failed.");
      setFile(null);
      setMessage(`Uploaded ${data.inserted} buyer rows.`);
      setPage(1);
      await loadBuyers(1);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function signOut(callApi = true) {
    if (callApi && token) {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers,
      }).catch(() => {});
    }
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  if (!token) {
    return (
      <main className="auth-shell">
        <section className="intro">
          <p className="eyebrow">Technical intern assignment</p>
          <h1>Buyer Management Portal</h1>
          <p>
            Register, sign in, upload buyer files, and view searchable buyer
            records from a SQL database.
          </p>
        </section>

        <section className="panel auth-panel">
          <div className="tabs" aria-label="Authentication mode">
            <button
              className={authMode === "signin" ? "active" : ""}
              onClick={() => setAuthMode("signin")}
              type="button"
            >
              Sign In
            </button>
            <button
              className={authMode === "signup" ? "active" : ""}
              onClick={() => setAuthMode("signup")}
              type="button"
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={submitAuth} className="form-grid">
            {authMode === "signup" ? (
              <>
                <label>
                  Name
                  <input
                    value={authForm.name}
                    onChange={(event) =>
                      setAuthForm({ ...authForm, name: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(event) =>
                      setAuthForm({ ...authForm, email: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Mobile
                  <input
                    value={authForm.mobile}
                    onChange={(event) =>
                      setAuthForm({ ...authForm, mobile: event.target.value })
                    }
                    required
                  />
                </label>
              </>
            ) : (
              <label>
                Email or mobile
                <input
                  value={authForm.login}
                  onChange={(event) =>
                    setAuthForm({ ...authForm, login: event.target.value })
                  }
                  required
                />
              </label>
            )}

            <label>
              Password
              <input
                type="password"
                minLength={6}
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm({ ...authForm, password: event.target.value })
                }
                required
              />
            </label>

            <button className="primary" disabled={loading}>
              {loading ? "Please wait" : authMode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {message ? <p className="message">{message}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Buyer Data</h1>
        </div>
        <div className="user-box">
          <span>{user?.name}</span>
          <button onClick={() => signOut()} type="button">
            Logout
          </button>
        </div>
      </header>

      <section className="toolbar">
        <form onSubmit={uploadFile} className="upload">
          <input
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <button className="primary" disabled={loading}>
            Upload
          </button>
        </form>
        <input
          className="search"
          placeholder="Search by name, email, or mobile"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </section>

      {message ? <p className="message">{message}</p> : null}

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Mobile</th>
              <th>Address</th>
              <th>Invoice</th>
              <th>Paid</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {buyers.map((buyer) => (
              <tr key={buyer.id}>
                <td>{buyer.name}</td>
                <td>{buyer.email}</td>
                <td>{buyer.mobile}</td>
                <td>{buyer.address || "-"}</td>
                <td>{currency(buyer.totalInvoiceAmount)}</td>
                <td>{currency(buyer.totalAmountPaid)}</td>
                <td>{currency(buyer.totalAmountDue)}</td>
              </tr>
            ))}
            {!buyers.length ? (
              <tr>
                <td colSpan="7" className="empty">
                  No buyer data found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <footer className="pager">
        <button
          onClick={() => setPage((current) => Math.max(current - 1, 1))}
          disabled={page <= 1}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </footer>
    </main>
  );
}
