import crypto from 'node:crypto';

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}

export async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, Date.now() + SESSION_TTL_MS);
  return token;
}

export function authMiddleware(db) {
  return async (req, res, next) => {
    const token = readToken(req);
    const user =
      token &&
      (await db.get(
        `SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > ?`,
        token,
        Date.now(),
      ));
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    req.user = user;
    req.token = token;
    next();
  };
}

export const COOKIE = 'fm_sid';

export function readToken(req) {
  const cookie = req.get('cookie') || '';
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})(?:;|$)`).exec(cookie);
  return m ? m[1] : null;
}

export function setSessionCookie(req, res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function requireOwner(req, res, next) {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Chỉ chủ tiệm được thao tác' });
  next();
}

/** Simple in-memory limiter for login attempts: max `limit` per `windowMs` per key. */
export function rateLimiter(limit = 10, windowMs = 15 * 60 * 1000) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    return arr.length <= limit;
  };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
