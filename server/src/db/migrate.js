import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
if (!pool) { console.error('DATABASE_URL is required to run migrations.'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../../migrations');
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  for (const filename of files) {
    const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
    if (exists.rowCount) { console.log(`skip ${filename}`); continue; }
    const sql = await fs.readFile(path.join(dir, filename), 'utf8');
    const client = await pool.connect();
    try { await client.query('BEGIN'); await client.query(sql); await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]); await client.query('COMMIT'); console.log(`applied ${filename}`); }
    catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
} catch (e) { console.error('Migration failed:', e); process.exitCode = 1; }
finally { await pool.end(); }
