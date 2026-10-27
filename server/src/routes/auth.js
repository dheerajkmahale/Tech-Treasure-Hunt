import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { clearSession, createGuestUser, issueSession, requireAuth } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

// Retrieve current player session, automatically provisioning if needed
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// Update display name for current player (no password or email needed)
router.post('/name', requireAuth, async (req, res, next) => {
  try {
    const { name } = z.object({ name: z.string().trim().min(1).max(50) }).parse(req.body);
    const result = await pool.query('UPDATE users SET full_name = $1 WHERE id = $2 RETURNING id, full_name, email, role', [name, req.user.id]);
    await pool.query('UPDATE teams SET name = $1 WHERE leader_id = $2', [`${name}'s Hunt`, req.user.id]);
    await pool.query('UPDATE characters SET character_name = $1 WHERE user_id = $2', [name.slice(0, 24), req.user.id]);
    res.json({ user: result.rows[0] });
  } catch (e) {
    next(e);
  }
});

// Reset session / fresh player
router.post('/reset', requireAuth, async (req, res, next) => {
  try {
    clearSession(res);
    const guest = await createGuestUser(res);
    res.json({ ok: true, user: guest });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

export default router;
