# API Reference

Base URL: `http://localhost:5000/api`. JSON requests use `Content-Type: application/json`. Authentication uses the existing HTTP-only `tth_session` cookie.

## Authentication
- `POST /auth/register` — `{ "fullName": "Player Name", "email": "player@example.com", "password": "a-long-password" }`
- `POST /auth/login` — `{ "email": "player@example.com", "password": "a-long-password" }`
- `POST /auth/logout`
- `GET /auth/me`

## Game
- `GET /game/state` — current player state, active public question bank, solved question IDs, reward totals, and bank readiness.
- `POST /game/start` — creates/starts a single-player game record. Returns `409 QUESTION_BANK_EMPTY` until the approved question bank is imported (current expected counts: 7, 7, 7, 6, 7).
- `POST /game/submit/:level` — `{ "questionId": "L1-Q1", "answer": "B" }`. For multiple-choice questions, answer is the option key (`A`, `B`, `C`, or `D`); for source questions with answer blanks or the written mission, answer is text. Correctness and rewards are determined on the server.
- `POST /game/focus` — `{ "eventType": "tab_hidden", "clientEventId": "unique-client-event-id" }`. Supported event types: `fullscreen_exit`, `tab_hidden`, `window_blur`.
- `GET /game/leaderboard` — server-recorded rankings, levels cleared, coins, gems, and status.
- `GET /game/timer` — player-session time remaining.

## Organizer
- Existing organizer endpoints remain protected by organizer-role middleware: `/organizer/teams`, `/organizer/classrooms`, `/organizer/events`, event controls, classroom assignment, and CSV export.
- `POST /organizer/seed-challenges` now returns `409 QUESTION_IMPORT_REQUIRED`; there are no built-in demo questions. Use the validated question import script instead.

## Question import
The approved bank is included at `server/seeds/approved-question-bank.json`. Import it from the project root:

```powershell
npm run questions:import --workspace server -- ./question-bank.json
```

Each question requires a unique `id`, `question`, and `answerType`. Multiple-choice questions require `options` and a private `_answer.correctOption`; text questions use private `_answer.acceptedAnswers`; rubric questions use `_answer.requiredGroups` and `_answer.minSentences`.

## Error shape
Most errors return `{ "error": "ERROR_CODE", "message": "Human-readable message" }`. Never expose database credentials, cookie secrets, or private answer payloads to the client.
