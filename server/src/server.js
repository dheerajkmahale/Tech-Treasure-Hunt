import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';
import { pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { importQuestionBank } from './db/importQuestions.js';

const port = Number(process.env.PORT || 5000);

async function autoInitDatabase() {
  if (!pool) {
    console.log('[db] DATABASE_URL not configured. Server ready for health checks, waiting for database connection string.');
    return;
  }
  try {
    console.log('[db] Verifying database migrations...');
    await runMigrations(pool);
    console.log('[db] Migrations verified.');

    const check = await pool.query(`SELECT COUNT(*)::int AS count FROM challenges WHERE challenge_type='multiple_choice'`);
    if (Number(check.rows[0].count) < 5) {
      console.log('[db] Questions not found in database. Auto-loading official 25-question bank...');
      const here = path.dirname(fileURLToPath(import.meta.url));
      const bankPath = path.resolve(here, '../seeds/approved-question-bank.json');
      await importQuestionBank(bankPath, pool);
      console.log('[db] Official 25-question bank loaded successfully.');
    } else {
      console.log(`[db] Question bank verified (${check.rows[0].count} levels loaded).`);
    }
  } catch (err) {
    console.error('[db] Database auto-initialization error:', err.message);
  }
}

app.listen(port, () => {
  console.log(`Treasure Hunt API listening on http://localhost:${port}`);
  autoInitDatabase().catch(err => console.error('[db] Unexpected initialization failure:', err));
});
