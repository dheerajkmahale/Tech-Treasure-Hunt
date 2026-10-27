# Tech Treasure Hunt — The Lost Archives of Code

An individual-player, five-level technical treasure hunt built with **React + Vite**, **Node.js/Express**, and **PostgreSQL**. The platform features 25 beginner-to-intermediate technical challenges across 5 levels, full-screen gameplay, anti-cheat focus-violation tracking, persistent coin and gem rewards, time penalties for incorrect submissions, and a real-time Hall of Fame leaderboard.

---

## 1. Production Deployment

The application is deployed across modern cloud infrastructure:

- **Frontend (Vercel)**: [https://tech-treasure-hunt-drab.vercel.app/](https://tech-treasure-hunt-drab.vercel.app/)
- **Backend (Render)**: [https://tech-treasure-hunt-laq9.onrender.com/](https://tech-treasure-hunt-laq9.onrender.com/)
- **API Health Endpoint**: [https://tech-treasure-hunt-laq9.onrender.com/api/health](https://tech-treasure-hunt-laq9.onrender.com/api/health)
- **Database**: Managed PostgreSQL on Render

---

## 2. Technology Stack & Architecture

- **Frontend**:
  - React 18, Vite, React Router, Lucide React icons, Tailwind CSS / Vanilla styling.
  - Dual-mode API client (`client/src/services/api.js`) supporting cookie sessions (`credentials: 'include'`) and `Authorization: Bearer <token>` fallback stored in `localStorage` (`tth_token`).
  - SPA routing and backend proxy rewrite via `vercel.json`.
- **Backend**:
  - Node.js (v20+) and Express.
  - Session authentication with bcrypt password hashing (cost factor 12) and JWT session tokens.
  - Dynamic CORS validator permitting Vercel production domains, preview domains, and local origins.
  - Connection pooling via `pg` (node-postgres) with production SSL (`rejectUnauthorized: false`) and resilient error handling.
- **Database**:
  - PostgreSQL 14+ schema with 6 incremental migrations.
  - Automated startup migration and question-bank seeding on boot.

---

## 3. Quick Start (Local Development)

### Prerequisites
- Node.js 20+ and npm
- PostgreSQL 14+ or Docker Desktop
- Windows 10/11 (PowerShell) or macOS/Linux

### Step-by-Step Installation

```powershell
# 1. Clone the repository and install root workspace dependencies
git clone https://github.com/dheerajkmahale/Tech-Treasure-Hunt.git
cd Tech-Treasure-Hunt
npm install

# 2. Configure environment variables
Copy-Item .env.example server/.env
# Edit server/.env with your local PostgreSQL DATABASE_URL and secrets

# 3. (Option A) Start local PostgreSQL using Docker Compose
docker compose up -d postgres

# 4. Start the backend API (Terminal 1)
npm run dev:server

# 5. Start the frontend client (Terminal 2)
npm run dev:client
```

- Open `http://localhost:5173` in your browser.
- The local backend API runs on `http://localhost:5000` (Health: `http://localhost:5000/api/health`).

---

## 4. Environment Variables Specification

Refer to [`.env.example`](.env.example) for safe templates. **Never commit `.env` or production credentials to Git.**

### Backend Web Service (Render)
Configure these in the Render Dashboard (**Web Service** -> **Environment**):

| Variable | Description | Safe Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string (prefer Internal URL on Render) | `postgresql://user:pass@host:5432/treasurehunt` |
| `NODE_ENV` | Environment mode (`production` enables SSL and cross-site cookies) | `production` |
| `CLIENT_URL` | Allowed frontend origin for CORS | `https://tech-treasure-hunt-drab.vercel.app` |
| `JWT_SECRET` | Secret key for signing player session tokens (32+ chars) | `generate_random_secret_at_least_32_chars` |
| `PORT` | Listening port (injected automatically by Render) | `5000` |
| `FOCUS_VIOLATION_LIMIT` | Max allowed blur/tab-out events before attempt ends | `3` |
| `COINS_PER_CORRECT_ANSWER`| Coins awarded per correct answer | `10` |
| `LEVEL_COMPLETION_BONUS` | Bonus coins for clearing all 5 questions in a level | `25` |
| `GEMS_PER_LEVEL` | Gems awarded per level completion | `1` |

### Frontend Application (Vercel)
Configure in Vercel Project Settings (**Environment Variables**):

| Variable | Description | Value |
| :--- | :--- | :--- |
| `VITE_API_URL` | Public backend API origin | `https://tech-treasure-hunt-laq9.onrender.com` |

---

## 5. Database Initialization & The 25-Question Bank

### Automatic Initialization on Startup
When the backend boots with a configured `DATABASE_URL`:
1. **Migrations**: `server/src/server.js` automatically invokes `runMigrations()`, safely applying all migration scripts (`001_initial_schema.sql` through `006_penalty_and_timestamps.sql`) in sequence if not already present.
2. **Official Question Bank**: The server automatically calls `importQuestionBank()` using the official bank in `server/seeds/approved-question-bank.json`. It validates schema, level distribution (5 levels × 5 questions = 25 questions), and seeds challenges idempotently (`ON CONFLICT (id) DO NOTHING`).

### Manual CLI Execution (Optional / Local Dev)
You can also run migrations and question seeding manually:

```powershell
# Run migrations
npm run db:migrate --workspace server

# Import the official 25-question bank
npm run questions:import --workspace server -- ./seeds/approved-question-bank.json
```

### The Five Levels
1. **The Cipher Crypt** — Decipher the Script (5 typed questions)
2. **The Broken Machine** — Repair Corrupted Code (5 mixed code/fix questions)
3. **Chamber of Riddles** — Think Like the Ancients (5 typed questions)
4. **Scam Sleuths** — Spot the Fraud (5 multiple-choice questions)
5. **Crack the Logic** — Boolean Gates & Deduction (5 mixed logic questions)

**Question Privacy**: Question titles, descriptions, code snippets, and multiple-choice options are delivered to the participant's browser only for their current active level. Correct answers are kept strictly on the backend and evaluated securely server-side.

---

## 6. Gameplay, Scoring & Anti-Cheat Rules

- **Scoring**:
  - Correct answer: **10 coins**.
  - Complete all 5 questions in a level: **25 bonus coins + 1 gem**.
  - 5 gems represent full completion across all 5 levels.
  - Re-submitting an already answered question does not award duplicate coins.
- **Penalties**:
  - Each incorrect submission adds **60 seconds** of penalty time (`penalty_seconds`), reducing the remaining time countdown. The Hall of Fame leaderboard ranks by `total_time = elapsed_seconds + penalty_seconds`.
  - Duplicate requests with identical `attemptId` are deduplicated to prevent double penalties on double-clicks.
- **Fullscreen & Focus Monitoring**:
  - The game requests browser fullscreen upon starting an attempt.
  - The client monitors tab-blur, visibility-hidden, and fullscreen-exit events, logging them to `/api/game/focus-event`. Exceeding `FOCUS_VIOLATION_LIMIT` (default: 3) terminates the attempt.

---

## 7. Testing & Verification

The project includes automated validation suites and build verification scripts:

```powershell
# 1. System verification test suite (covers question bank, validation schemas, bcrypt, JWT, migrations, CORS)
npm test --workspace server

# 2. Syntax verification on backend services
npm run check --workspace server

# 3. Client production build check
npm run build --workspace client
```

### Verified Test Results
- **Question Bank Schema & Data Integrity**: 25 questions validated across 5 levels (5 questions/level), zero duplicate IDs.
- **Authentication Validation**: Zod schema verifies 2-100 char names, RFC email format, and 10-128 char passwords.
- **Password Security**: Bcrypt cost factor 12 verified for hashing and comparison.
- **Session Tokens**: JWT signing and claims verification tested.
- **Migrations**: All 6 migration files verified and sequenced.
- **CORS Matching**: Dynamic validator tested against Vercel production, preview branches, and localhost.
- **Vite Build**: Successfully bundles `dist/` with 0 errors.

---

## 8. Current Project Status

- **Backend & Database**: Fully deployed on Render. PostgreSQL is connected, migrations are applied, and the official 25-question bank is imported.
- **Health Endpoint**: Live and verified responding with `{"status":"ok","service":"tech-treasure-hunt-api","database":"connected"}`.
- **Frontend**: Live on Vercel with SPA fallback and API proxying configured.
- **Next Steps for Event Organizers**: Before running a live tournament, perform a complete dry-run playthrough (register an account, play through levels, verify leaderboard sorting) to familiarize organizers with the event flow.
