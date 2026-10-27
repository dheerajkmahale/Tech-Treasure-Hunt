import { Router } from 'express';
const router = Router();
router.get('/', (_req, res) => res.json({ status: 'ok', service: 'tech-treasure-hunt-api', timestamp: new Date().toISOString() }));
export default router;
