import rateLimit from 'express-rate-limit';

/**
 * Normalizes and extracts the real client IP address from request headers.
 * When deployed behind Render (which uses Cloudflare edge routing), client IP is passed via:
 * 1. cf-connecting-ip (Cloudflare edge header)
 * 2. true-client-ip
 * 3. req.ip (Express proxy-resolved client IP, when 'trust proxy' is configured)
 * 4. x-forwarded-for (first IP in the comma-separated list)
 * 5. req.socket.remoteAddress (direct TCP socket)
 */
export function getClientIp(req) {
  const cf = req.headers?.['cf-connecting-ip'];
  if (cf && typeof cf === 'string') {
    const ip = cleanIp(cf.split(',')[0]);
    if (ip) return ip;
  }

  const trueClient = req.headers?.['true-client-ip'];
  if (trueClient && typeof trueClient === 'string') {
    const ip = cleanIp(trueClient.split(',')[0]);
    if (ip) return ip;
  }

  if (req.ip) {
    const ip = cleanIp(req.ip);
    if (ip) return ip;
  }

  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const ip = cleanIp(forwarded.split(',')[0]);
    if (ip) return ip;
  }

  return cleanIp(req.socket?.remoteAddress || '127.0.0.1');
}

export function cleanIp(ip) {
  if (!ip) return '';
  let cleaned = String(ip).trim();
  // Strip IPv6-mapped IPv4 prefix (e.g., ::ffff:192.168.1.1)
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.slice(7);
  }
  // Strip port number if appended (e.g. 192.168.1.1:54321 or [::1]:54321)
  if (/^\[.+\]:\d+$/.test(cleaned)) {
    cleaned = cleaned.replace(/^\[(.+)\]:\d+$/, '$1');
  } else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(cleaned)) {
    cleaned = cleaned.replace(/:\d+$/, '');
  }
  return cleaned;
}

/**
 * General API rate limiter applied to /api.
 * 120 requests per minute per client IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: {
    error: 'API_RATE_LIMIT',
    message: 'Too many requests. Please wait a moment before trying again.'
  }
});

/**
 * Authentication rate limiter applied to /api/auth/register and /api/auth/login.
 * 30 attempts per 15 minutes per client IP (configurable via AUTH_RATE_LIMIT_MAX / AUTH_RATE_LIMIT_WINDOW_MS).
 * Protects against brute-force and automated account generation while allowing normal users and shared networks to register.
 */
export const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: {
    error: 'AUTH_RATE_LIMIT',
    message: 'Too many authentication attempts. Please wait a few minutes before trying again.'
  }
});
