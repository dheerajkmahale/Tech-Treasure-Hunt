import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { clearSession, issueSession, requireAuth } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'AUTH_RATE_LIMIT', message: 'Too many authentication attempts. Try again later.' } });
const registerSchema = z.object({ fullName: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), password: z.string().min(10).max(128) });
router.post('/register', authLimiter, async (req,res,next) => {
  try {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const hash = await bcrypt.hash(input.password, 12);
    const result = await pool.query("INSERT INTO users(full_name,email,password_hash,role) VALUES ($1,$2,$3,'player') RETURNING id,full_name,email,role,created_at", [input.fullName, email, hash]);
    issueSession(res, result.rows[0]);
    await audit(result.rows[0].id, 'user.registered', 'user', result.rows[0].id);
    res.status(201).json({ user: result.rows[0] });
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'EMAIL_EXISTS', message: 'An account with this email already exists.' }); next(e); }
});
router.post('/login', authLimiter, async (req,res,next) => {
  try {
    const input = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128) }).parse(req.body);
    const result = await pool.query('SELECT id,full_name,email,role,password_hash FROM users WHERE email=$1', [input.email.toLowerCase()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
    issueSession(res, user);
    await audit(user.id, 'user.logged_in', 'user', user.id);
    res.json({ user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
  } catch (e) { next(e); }
});
router.post('/logout', (req,res) => { clearSession(res); res.json({ ok: true }); });
router.get('/me', requireAuth, async (req,res) => res.json({ user: req.user }));
export default router;
