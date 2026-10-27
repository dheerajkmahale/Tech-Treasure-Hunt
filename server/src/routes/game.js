import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getGameState, getLeaderboard, startGame, submitLevel } from '../services/game.js';
import { pool } from '../db/pool.js';
const router = Router();
router.get('/state', requireAuth, async (req,res,next) => { try { res.json(await getGameState(req.user.id)); } catch(e) { next(e); } });
router.post('/start', requireAuth, async (req,res,next) => { try { res.json(await startGame(req.user.id)); } catch(e) { next(e); } });
router.post('/submit/:level', requireAuth, async (req,res,next) => {
  try {
    const level = Number(req.params.level);
    const body = z.object({ questionId: z.string().max(100).optional(), attemptId: z.string().max(100).optional(), answer: z.string().max(3000).optional(), code: z.string().max(20000).optional(), answers: z.record(z.string().max(100)).optional(), explanations: z.record(z.string().max(1000)).optional(), prompt: z.string().max(5000).optional(), language: z.string().max(50).optional() }).parse(req.body);
    res.json(await submitLevel(req.user.id, level, body));
  } catch(e) { next(e); }
});

router.post('/focus', requireAuth, async (req,res,next) => {
  try {
    const body = z.object({ eventType: z.enum(['fullscreen_exit','tab_hidden','window_blur']), clientEventId: z.string().min(8).max(100) }).parse(req.body);
    const member = await pool.query(`SELECT t.id,t.status,t.focus_violations FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.user_id=$1`, [req.user.id]);
    if (!member.rowCount || member.rows[0].status !== 'in_progress') return res.json({ counted: false, terminated: false });
    const team = member.rows[0];
    const inserted = await pool.query(`INSERT INTO focus_events(team_id,user_id,event_type,client_event_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,client_event_id) DO NOTHING RETURNING id`, [team.id,req.user.id,body.eventType,body.clientEventId]);
    if (!inserted.rowCount) return res.json({ counted: false, terminated: team.status === 'terminated', violations: team.focus_violations });
    const count = await pool.query('UPDATE teams SET focus_violations=focus_violations+1 WHERE id=$1 RETURNING focus_violations', [team.id]);
    const violations = Number(count.rows[0].focus_violations);
    const limit = Math.max(1, Number(process.env.FOCUS_VIOLATION_LIMIT || 3));
    const terminated = violations >= limit;
    if (terminated) await pool.query("UPDATE teams SET status='terminated',terminated_at=NOW() WHERE id=$1", [team.id]);
    res.json({ counted: true, violations, limit, terminated });
  } catch(e) { next(e); }
});
router.get('/leaderboard', async (_req,res,next) => { try { res.json({ leaderboard: await getLeaderboard() }); } catch(e) { next(e); } });
router.get('/timer', requireAuth, async (req,res,next) => {
  try {
    const r = await pool.query(`SELECT t.game_started_at,t.completed_at,t.penalty_seconds,t.status AS team_status FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.user_id=$1`, [req.user.id]);
    if (!r.rowCount) return res.json({ startedAt: null, remainingSeconds: null, status: 'lobby' });
    const row = r.rows[0];
    const durationMinutes = Number(process.env.DEFAULT_EVENT_DURATION_MINUTES || 70);
    const startedAt = row.game_started_at;
    const endAt = row.completed_at ? new Date(row.completed_at).getTime() : Date.now();
    const elapsed = startedAt ? Math.max(0, Math.floor((endAt - new Date(startedAt).getTime()) / 1000)) : null;
    const penaltySeconds = Number(row.penalty_seconds || 0);
    res.json({ startedAt, status: row.team_status, durationMinutes, penaltySeconds, elapsedSeconds: elapsed, totalSeconds: elapsed === null ? null : elapsed + penaltySeconds, remainingSeconds: elapsed === null ? null : Math.max(0, durationMinutes*60-elapsed-penaltySeconds) });
  } catch(e) { next(e); }
});
export default router;
