import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  let dbStatus = 'not_configured';

  if (pool) {
    try {
      await pool.query('SELECT 1');
      dbStatus = 'connected';
    } catch (err) {
      dbStatus = 'error';
    }
  }

  const isHealthy = dbStatus === 'connected';
  res.status(isHealthy ? 200 : 200).json({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'tech-treasure-hunt-api',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

export default router;
