import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import teamsRouter from './routes/teams.js';
import gameRouter from './routes/game.js';
import organizerRouter from './routes/organizer.js';
import { requireDb } from './db/pool.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.CLIENT_URL && process.env.CLIENT_URL.split(',').map(s => s.trim()).includes(origin)) {
      return callback(null, true);
    }
    try {
      const parsed = new URL(origin);
      if (parsed.hostname.endsWith('.vercel.app') || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return callback(null, true);
      }
    } catch {}
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/health', healthRouter);
app.get('/api', (_req, res) => res.json({ name: 'Tech Treasure Hunt API', version: '0.2.0', status: 'ready', docs: '/docs/API.md' }));
app.use('/api/auth', requireDb, authRouter);
app.use('/api/teams', requireDb, teamsRouter);
app.use('/api/game', requireDb, gameRouter);
app.use('/api/organizer', requireDb, organizerRouter);
app.use((req,res) => res.status(404).json({ error: 'NOT_FOUND', message: 'That API route does not exist.' }));
app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: 'VALIDATION_ERROR', issues: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
  if (err.code === '23505') return res.status(409).json({ error: 'DUPLICATE_RESOURCE', message: 'That value is already in use.' });
  if (err.code === '23503') return res.status(400).json({ error: 'INVALID_REFERENCE', message: 'A referenced record does not exist.' });
  const status = Number(err.status) || 500;
  if (status >= 500) console.error('[api-error]', err);
  res.status(status).json({ error: err.code || (status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'), message: status === 500 ? 'Something went wrong. Check the server logs for details.' : err.message });
});
export default app;
