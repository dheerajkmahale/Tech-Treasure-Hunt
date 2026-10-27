# Game Rules — Individual Player Edition

- One authenticated account is one player. A solo game record and default character are created when the player starts.
- There are five levels, completed in order: The Cipher Crypt, The Broken Machine, Chamber of Riddles, Scam Sleuths, and Crack the Logic.
- There are 25 questions in total: 5 in each level.
- The participant sees one question at a time. Levels 1 and 3 use typed answers; Levels 2 and 5 mix typed and multiple-choice; Level 4 is multiple-choice. Code-fix answers in Level 2 must match the corrected code exactly (capital letters count; spaces are ignored).
- A correct answer earns 10 coins; an incorrect answer earns no reward and can be retried. Correct answers are checked by the server. A previously solved question cannot award duplicate coins.
- Every wrong answer adds 1 minute (60 s) to the player's time. Ranking uses elapsed time + penalties.
- Completing every question in a level awards 25 bonus coins and one gem, then unlocks the next level.
- Completing all five levels awards five gems and records the player's completion.
- Import `server/seeds/approved-question-bank.json` using the question import script before play.
- The backend's current level is authoritative. Submissions for locked levels are rejected.
- The leaderboard uses server/database records. Gems and coins are displayed as collected rewards, not as a replacement for the existing ranking rule.
- Focus events (fullscreen exit, tab hidden, window blur) are timestamped and counted during an active attempt. The configured limit defaults to three violations.
- Browsers cannot reliably lock the computer or prevent use of other apps/devices. Focus monitoring is best-effort.
