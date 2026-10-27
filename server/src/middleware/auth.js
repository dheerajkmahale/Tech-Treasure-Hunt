import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';

const COOKIE_NAME = 'tth_session';
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 1000 * 60 * 60 * 12 });
export function issueSession(res, user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  const token = jwt.sign({ sub: String(user.id), role: user.role }, secret, { expiresIn: '12h', issuer: 'tech-treasure-hunt' });
  res.cookie(COOKIE_NAME, token, cookieOptions());
}
export function clearSession(res) { res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }); }
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Please log in to continue.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'tech-treasure-hunt' });
    const result = await pool.query('SELECT id, full_name, email, role FROM users WHERE id = $1', [payload.sub]);
    if (!result.rowCount) return res.status(401).json({ error: 'SESSION_INVALID' });
    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return res.status(401).json({ error: 'SESSION_INVALID', message: 'Your session has expired. Please log in again.' });
    next(error);
  }
}
export function requireOrganizer(req, res, next) {
  if (req.user?.role !== 'organizer') return res.status(403).json({ error: 'ORGANIZER_ONLY', message: 'Organizer access is required.' });
  next();
}
