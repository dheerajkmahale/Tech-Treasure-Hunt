# Tech Treasure Hunt — The Lost Archives of Code

An individual-player, five-level treasure hunt built with React + Vite, Node.js/Express, and PostgreSQL. This revision removes the old demo questions and adds a validated question-bank import workflow, fullscreen-style gameplay, persistent coins/gems, focus-event logging, and a Hall of Fame view.

## Requirements
- Node.js 20+ and npm
- Docker Desktop (recommended) or PostgreSQL 14+
- Windows 10/11 and PowerShell are supported

## Quick start on Windows PowerShell
Run these commands from the extracted `tech-treasure-hunt` project folder.

```powershell
# 1. Install packages
npm install

# 2. Create your local environment file
Copy-Item .env.example server/.env
# Edit server/.env and set DATABASE_URL, JWT_SECRET, and COOKIE_SECRET.

# 3. Start PostgreSQL using Docker Desktop
docker compose up -d postgres

# 4. Apply database migrations (includes new 006 penalty columns)
npm run db:migrate --workspace server

# 5. Import the approved questions (required before starting a game)
npm run questions:import --workspace server -- ./seeds/approved-question-bank.json

# 6. Start the API (terminal 1)
npm run dev:server

# 7. Start the website (terminal 2)
npm run dev:client
```

Open `http://localhost:5173`. The API health endpoint is `http://localhost:5000/api/health`.

Example local database URL (matches the supplied Docker Compose file):

```env
DATABASE_URL=postgresql://postgres:local_dev_password@localhost:5432/tech_treasure_hunt
```

Change the placeholder JWT and cookie secrets in `server/.env` before use beyond local development. Never commit `.env`.

## Five levels
1. **The Cipher Crypt** — Decipher the Script
2. **The Broken Machine** — Repair What Was Corrupted
3. **Chamber of Riddles** — Think Like the Ancients
4. **Scam Sleuths** — Spot the Fraud
5. **Crack the Logic** — Boolean Gates and Deduction

The question bank (`server/seeds/approved-question-bank.json`) now has **25 beginner-friendly questions: 5 per level**. Questions mix typed answers and multiple-choice: Levels 1 and 3 are fully typed, Levels 2 and 5 mix both, and Level 4 is multiple-choice. Level 2 code-fix answers must match the corrected code exactly (capital letters count; spaces are ignored). Any question can include an optional `code` field that is shown as a numbered code block.

## Review or replace the supplied question bank
The included bank is `server/seeds/approved-question-bank.json`. Its question format supports multiple-choice questions, accepted short answers, and a rubric-based written response. Correct answers are stored in the private part of the bank and are not sent to participants.

To import the included bank, run from the project root:

```powershell
npm run questions:import --workspace server -- ./seeds/approved-question-bank.json
```

The importer validates five levels, expected counts (5, 5, 5, 5, 5), unique IDs, answer formats, options, and answer references. If validation fails, it stops without replacing the current bank. A successful import replaces challenge assignments and challenge content, while preserving user accounts and organizer accounts.

For a future bank, use `server/question-bank.template.json` as a format guide. Each level must contain exactly 5 questions.

**Question privacy:** question text and options are sent to the browser for the active level; correct answers remain in the database's private payload and are never included in the participant game-state response.

## Time and penalty rules
- Every wrong answer adds **60 seconds** to the player's time (stored in `teams.penalty_seconds`, separate from real elapsed time). The countdown loses 60 s and the Hall of Fame ranks by `elapsed + penalty`.
- The server ignores repeated submissions that carry the same `attemptId`, so double-clicks/retries never charge twice.
- Between levels the game shows a congratulations / next-level transition screen.
- The Hall of Fame shows each player's started and finished timestamp in the viewer's local time.

## Reward rules
- Correct answer: **10 coins**.
- Complete every question in a level: **25 bonus coins + 1 gem**.
- Incorrect answers earn no reward.
- The backend checks previous successful submissions so replaying a correct answer does not award coins twice.
- Five gems represent completion of all five levels.

Rewards are stored on the existing game-session/team record. New player sessions automatically create a single-player record and a default character. The legacy team tables remain in the schema for compatibility with existing data, but team assembly is no longer part of the participant interface.

## Fullscreen and focus monitoring
The game asks for fullscreen only after the player clicks **Start Game in Full Screen**. During an active attempt, it logs fullscreen exits, tab-hidden events, and window blur. The default limit is three incidents; the server terminates the attempt at the configured limit.

Set `FOCUS_VIOLATION_LIMIT` in `server/.env` to change the limit. Reward values can be adjusted with `COINS_PER_CORRECT_ANSWER`, `LEVEL_COMPLETION_BONUS`, and `GEMS_PER_LEVEL`. Focus incidents are timestamped in `focus_events` and deduplicated by client event ID. The UI debounces overlapping browser events.

**Browser limitation:** ordinary websites cannot lock a student's computer or reliably prevent switching apps, opening another device, or using external assistance. Browser focus events can also occur for legitimate operating-system reasons. Explain the rules before the event, use the same threshold for every participant, and have an organizer available to review exceptional cases. Fullscreen permission failure alone does not terminate the attempt.

## Environment options
- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`, `COOKIE_SECRET`: strong random secrets.
- `DEFAULT_EVENT_DURATION_MINUTES`: event timer default (existing timer endpoint).
- `FOCUS_VIOLATION_LIMIT`: allowed focus violations before termination; default `3`.
- `ORGANIZER_EMAIL` / `ORGANIZER_PASSWORD`: optional organizer account settings used by the existing seed script.

## Testing and known limitations
- Backend JavaScript syntax checks are available with `npm run check --workspace server`.
- Frontend production build requires installed npm dependencies (`npm install`, then `npm run build`).
- Database migrations and gameplay integration require a running PostgreSQL instance. This environment did not provide a running PostgreSQL server, so migrations, real sign-in, reward transactions, and fullscreen browser behavior must be verified locally before the live event.
- Focus monitoring is best-effort, not a computer lock. Use a consistent policy and an organizer review process.
- The existing database is retained, but migration `005_remove_legacy_questions.sql` deliberately deletes legacy challenge assignments and challenge content so the old demo questions cannot appear. Player accounts and organizer accounts are preserved.
- The application uses the existing server-side evaluation boundary, but this revision is a local event-ready foundation, not a security audit or guarantee against cheating.


## Importing the questions
After every update re-run the import (it replaces old challenge content and keeps player accounts):

```powershell
npm run db:migrate --workspace server
npm run questions:import --workspace server -- ./seeds/approved-question-bank.json
```

## One-click question update
After `npm install` and creating `server/.env`, double-click `update-questions.bat` (or run `.\update-questions.ps1`) to start the database, apply migrations and import the question bank in one go.
