# Changes in this update
- 25 questions (5 per level), easier wording, code shown in numbered code blocks.
- Level 2 is now multiple-choice debugging with options. Level 4 options are neutral (no red highlighted giveaway images).
- +1 minute penalty per wrong answer (server enforced, idempotent via attemptId). New migration `006_penalty_and_timestamps.sql`.
- Level transition screens (welcome, level cleared -> next level).
- Hall of Fame: time incl. penalty, started and finished timestamps.
- Question heading reduced and softened; small text raised to 12-15px; question card fades in.
Run after unzipping: `npm install`, `npm run db:migrate --workspace server`, `npm run questions:import --workspace server -- ./seeds/approved-question-bank.json`.

## Latest tweak
- New question set for all five levels (5 each): Level 1 and 3 typed answers; Levels 2 and 5 mix typed and multiple-choice; Level 4 multiple-choice.
- Two Level 2 code-fix questions (L2Q2, L2Q5) use an exact, case-sensitive comparison (`exactMatch`) so the original buggy line is no longer accepted.
- UI, rewards, penalties, focus rules and all other code are unchanged. Re-run the question import (see update-questions.bat) to apply.
