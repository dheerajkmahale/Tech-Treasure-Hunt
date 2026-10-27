function resolveApiBase() {
  const envUrl = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!envUrl) {
    return '/api';
  }
  const clean = envUrl.replace(/\/+$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

const API_BASE = resolveApiBase();

function getStoredToken() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('tth_token') : null;
  } catch {
    return null;
  }
}

function setStoredToken(token) {
  try {
    if (typeof localStorage !== 'undefined') {
      if (token) localStorage.setItem('tth_token', token);
      else localStorage.removeItem('tth_token');
    }
  } catch {}
}

async function request(path, options = {}) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE}${cleanPath}`;
  const token = getStoredToken();
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, { ...options, credentials: 'include', headers });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.error;
    error.issues = data?.issues;
    throw error;
  }

  if (data?.token) {
    setStoredToken(data.token);
  }

  return data;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  register: p => request('/auth/register', json('POST', p)),
  login: p => request('/auth/login', json('POST', p)),
  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },
  me: () => request('/auth/me'),
  getGameState: () => request('/game/state'),
  startGame: () => request('/game/start', json('POST', {})),
  submitLevel: (level, p) => request(`/game/submit/${level}`, json('POST', p)),
  getLeaderboard: () => request('/game/leaderboard'),
  getTimer: () => request('/game/timer'),
  recordFocus: p => request('/game/focus', json('POST', p)),
};

export function readableError(error) {
  if (error?.issues && Array.isArray(error.issues) && error.issues.length > 0) {
    return error.issues.map(i => i.message).join(' ');
  }
  if (error?.status === 401) return 'Your session has expired. Please sign in again.';
  if (error?.status === 404) return error?.message || 'The requested archive endpoint was not found (404).';
  if (error?.status === 409) return error?.message || 'An account with this email already exists.';
  if (error?.status === 429) return error?.message || 'Too many attempts. Please wait before trying again.';
  if (error?.status === 503) return error?.message || 'Database connection is not configured on the server.';
  return error?.message || 'The archive could not be reached. Check that the API server is running.';
}
