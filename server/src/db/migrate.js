import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

export async function runMigrations(clientPool = pool) {
  if (!clientPool) throw new Error('DATABASE_URL is required to run migrations.');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(here, '../../migrations');

  await clientPool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  const applied = [];

  for (const filename of files) {
    const exists = await clientPool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
    if (exists.rowCount) {
      continue;
    }
    const sql = await fs.readFile(path.join(dir, filename), 'utf8');
    const client = await clientPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]);
      await client.query('COMMIT');
      applied.push(filename);
      console.log(`[db:migrate] applied ${filename}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  return applied;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  if (!pool) {
    console.error('DATABASE_URL is required to run migrations.');
    process.exit(1);
  }
  try {
    const applied = await runMigrations(pool);
    console.log(`Migrations complete. ${applied.length} new migration(s) applied.`);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
