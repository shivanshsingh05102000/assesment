# Buyer Management Portal

A compact full-stack implementation of the technical intern assignment. It includes user registration, login, JWT-protected routes, buyer file upload, SQL storage, search, pagination, and a responsive React interface.

## Tech Stack

- Frontend: React with Vite
- Backend: Node.js with Express
- Database: SQLite
- Authentication: JWT with 10-minute expiry and logout token invalidation
- Upload parsing: CSV, XLS, and XLSX

## Current Scope

Completed:

- Sign up with name, email, mobile, and password
- Server-side validation for user details
- Unique email and mobile checks
- Password hashing with bcrypt
- Sign in using email or mobile
- JWT-protected dashboard APIs
- Logout invalidates the current JWT
- CSV, XLS, and XLSX upload with 5 MB server-side limit
- Buyer data storage in SQL
- Paginated buyer table
- Search by buyer name, email, or mobile
- Responsive layout

Minimal or not production-ready:

- Refresh token support is implemented only as a simple authenticated refresh endpoint, not as a separate long-lived refresh-token table
- Unit tests are not included
- Role-based access is not included
- Deployment is not configured in this repository
- SQLite is used for easy local review instead of MySQL

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create an environment file:

```bash
copy .env.example .env
```

3. Start the app in development:

```bash
npm run dev
```

4. Open the frontend:

```text
http://127.0.0.1:5173
```

The backend runs on:

```text
http://localhost:4000
```

## Environment Variables

```text
PORT=4000
JWT_SECRET=change-this-secret-before-production
CLIENT_ORIGIN=http://127.0.0.1:5173
DB_FILE=./data/buyer_portal.sqlite
```

## Buyer Upload Format

The first row must contain these column names:

```text
Name, Email, Mobile, Address, Total Invoice Amount, Total Amount Paid, Total Amount Due
```

CSV example:

```csv
Name,Email,Mobile,Address,Total Invoice Amount,Total Amount Paid,Total Amount Due
Anita Sharma,anita@example.com,9876543210,Mumbai,25000,15000,10000
Rahul Verma,rahul@example.com,9876501234,Delhi,18000,18000,0
```

A ready-to-upload example file is included as `sample-buyers.csv`.

## Database Schema

The schema is available in `schema.sql`. On first run, the backend also creates the required tables automatically in `data/buyer_portal.sqlite`.

## Build

```bash
npm run build
```

After building, the Express server can serve the generated frontend:

```bash
npm start
```
