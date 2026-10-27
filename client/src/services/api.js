const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, credentials: 'include', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : null;
  if (!response.ok) { const error = new Error(data?.message || `Request failed (${response.status})`); error.status=response.status; error.code=data?.error; error.issues=data?.issues; throw error; }
  return data;
}
const json=(method,body)=>({method,body:JSON.stringify(body)});
export const api={
  register:p=>request('/auth/register',json('POST',p)), login:p=>request('/auth/login',json('POST',p)), logout:()=>request('/auth/logout',{method:'POST'}), me:()=>request('/auth/me'),
  getGameState:()=>request('/game/state'), startGame:()=>request('/game/start',json('POST',{})), submitLevel:(level,p)=>request(`/game/submit/${level}`,json('POST',p)),
  getLeaderboard:()=>request('/game/leaderboard'), getTimer:()=>request('/game/timer'), recordFocus:p=>request('/game/focus',json('POST',p)),
};
export function readableError(error){if(error?.status===401)return 'Your session has expired. Please sign in again.';if(error?.status===429)return 'Too many attempts. Please wait before trying again.';return error?.message||'The archive could not be reached. Check that the API server is running.';}
