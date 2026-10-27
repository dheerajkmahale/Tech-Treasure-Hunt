# Update and Test Report — Tech Treasure Hunt

## Implemented
- Reworked the participant UI into a large, responsive treasure-hunt interface with a single question at a time, visible level progress, coin/gem counters, a Hall of Fame, and fullscreen-start flow.
- Preserved the five level names and added the supplied PDF questions into `server/seeds/approved-question-bank.json`.
- Imported 34 source questions in counts **7 / 7 / 7 / 6 / 7**. Level 4's supplied PDF has six questions, so no seventh question was invented.
- Added server-side short-answer checking for Levels 1–3 and a simple 3–5 sentence keyword rubric for Level 4's written mission.
- Added two illustrative SVG email cards for the Level 4 Email A / Email B question, based only on the sender, subject, and body details in the supplied PDF. The PDF itself contained no embedded image options.
- Kept answer keys in the database private payload; participant-facing questions contain only question text and options.
- Corrected Level 1 Question 3's ciphertext so the provided key produces the published intended answer `ENTER`. The original ciphertext/key pair in the PDF did not produce `ENTER`; the discrepancy is documented in `QUESTIONS_FROM_SUPPLIED_PDFS.md`.
- Added/updated the question importer, question template, game rules, API notes, setup guide, and source review notes.

## Checks performed
- `npm run check --workspace server` passed (Node syntax checks for the server app and existing backend services).
- `node --check` passed for the modified question importer, game service, and game route.
- Parsed the approved question bank as JSON; checked that the five counts are 7/7/7/6/7 (34 total), IDs/question text/answer keys are present, and answer types have the required data.
- Parsed the two Level 4 SVG files as XML successfully.
- Verified the ZIP archive structure after packaging.

## Not tested in this environment
- `npm install` timed out, so a frontend Vite production build could not be run.
- No PostgreSQL service was available, so database migrations, import transaction execution, registration/sign-in, reward integrity against a live DB, and end-to-end gameplay could not be integration-tested.
- No browser automation was available to test fullscreen/visibility monitoring.

## Organizer checks before the event
1. Confirm the Level 1 Question 3 ciphertext correction.
2. Supply a seventh Level 4 question if the event must have exactly 35 questions.
3. Review the short-answer accepted variants and the Level 4 written-answer rubric with the judging team; rubric-based automated marking should not be the sole basis for a high-stakes decision.
4. Install dependencies, run the Vite build, start PostgreSQL, run migrations and question import, then test a fresh account through all five levels before students use the system.
5. Use HTTPS and strong environment secrets for any hosted deployment. Browser fullscreen is not a complete computer lock.
