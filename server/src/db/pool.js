import pg from 'pg';
const { Pool } = pg;

function getSslConfig() {
  const url = process.env.DATABASE_URL || '';
  if (process.env.DATABASE_SSL === 'false' || url.includes('sslmode=disable')) {
    return false;
  }
  // Production managed databases (Render, Supabase, Neon, RDS) require SSL
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_SSL === 'true' || url.includes('sslmode=require') || url.includes('ssl=true')) {
    return { rejectUnauthorized: false };
  }
  return false;
}

export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: getSslConfig(),
      max: Number(process.env.PG_MAX_POOL || 15),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;

if (pool) {
  pool.on('error', (err) => {
    console.error('[pg-pool-error] Unexpected error on idle client:', err.message);
  });
}

export function requireDb(_req, res, next) {
  if (!pool) {
    const msg = process.env.NODE_ENV === 'production'
      ? 'Database connection (DATABASE_URL) is not configured in the server environment.'
      : 'Set DATABASE_URL in the server .env file and start PostgreSQL.';
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: msg });
  }
  next();
}
