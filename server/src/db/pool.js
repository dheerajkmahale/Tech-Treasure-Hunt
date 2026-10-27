import pg from 'pg';
const { Pool } = pg;
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false })
  : null;
export function requireDb(_req, res, next) {
  if (!pool) return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'Set DATABASE_URL in the server .env file and start PostgreSQL.' });
  next();
}
