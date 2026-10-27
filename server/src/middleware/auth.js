import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';

const COOKIE_NAME = 'tth_session';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 1000 * 60 * 60 * 24 * 30
});

export function issueSession(res, user) {
  const secret = process.env.JWT_SECRET || 'treasure-hunt-default-secret-key-32-chars-long';
  const token = jwt.sign({ sub: String(user.id), role: user.role }, secret, { expiresIn: '30d', issuer: 'tech-treasure-hunt' });
  if (res && typeof res.cookie === 'function') {
    res.cookie(COOKIE_NAME, token, cookieOptions());
  }
  return token;
}

export function clearSession(res) {
  if (res && typeof res.clearCookie === 'function') {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  }
}

export async function createGuestUser(res, customName = null) {
  const fullName = (customName ? customName.trim() : 'Explorer').slice(0, 100) || 'Explorer';
  const email = `player_${crypto.randomUUID()}@hunt.local`;
  const result = await pool.query(
    "INSERT INTO users(full_name, email, password_hash, role) VALUES ($1, $2, 'no_password', 'player') RETURNING id, full_name, email, role, created_at",
    [fullName, email]
  );
  const user = result.rows[0];
  issueSession(res, user);
  return user;
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    const secret = process.env.JWT_SECRET || 'treasure-hunt-default-secret-key-32-chars-long';
    if (token) {
      try {
        const payload = jwt.verify(token, secret, { issuer: 'tech-treasure-hunt' });
        const result = await pool.query('SELECT id, full_name, email, role FROM users WHERE id = $1', [payload.sub]);
        if (result.rowCount) {
          req.user = result.rows[0];
          return next();
        }
      } catch {
        // Token invalid or expired, continue to guest creation below
      }
    }
    // No login required: automatically provision guest session
    const guest = await createGuestUser(res);
    req.user = guest;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireOrganizer(req, res, next) {
  if (req.user?.role !== 'organizer') return res.status(403).json({ error: 'ORGANIZER_ONLY', message: 'Organizer access is required.' });
  next();
}
