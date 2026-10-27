import { pool } from '../db/pool.js';
export async function audit(actorId, action, targetType = null, targetId = null, details = {}) {
  if (!pool) return;
  await pool.query('INSERT INTO audit_logs(actor_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)', [actorId ?? null, action, targetType, targetId == null ? null : String(targetId), JSON.stringify(details)]);
}
