const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.error;
    error.issues = data?.issues;
    throw error;
  }
  return data;
}
const json = (method, body) => ({ method, body: JSON.stringify(body) });
export const api = {
  me: () => request('/auth/me'),
  updateName: (name) => request('/auth/name', json('POST', { name })),
  getGameState: () => request('/game/state'),
  startGame: (p = {}) => request('/game/start', json('POST', p)),
  resetGame: () => request('/game/reset', json('POST', {})),
  submitLevel: (level, p) => request(`/game/submit/${level}`, json('POST', p)),
  getLeaderboard: () => request('/game/leaderboard'),
  getTimer: () => request('/game/timer'),
  recordFocus: (p) => request('/game/focus', json('POST', p)),
};
export function readableError(error) {
  if (error?.status === 429) return 'Too many attempts. Please wait before trying again.';
  return error?.message || 'The archive could not be reached. Check that the API server is running.';
}
