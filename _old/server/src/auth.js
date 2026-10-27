import { createHash, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { HttpError } from './http.js';

const TOKEN_TTL = '12h';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest();
}

export function checkPassword(input, expected) {
  return timingSafeEqual(sha256(input), sha256(expected));
}

export function signAdminToken(secret) {
  return jwt.sign({ role: 'admin' }, secret, { algorithm: 'HS256', expiresIn: TOKEN_TTL });
}

export function requireAdmin(secret) {
  return (req, _res, next) => {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Chưa đăng nhập');
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
      if (payload.role !== 'admin') throw new Error('bad role');
    } catch {
      throw new HttpError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }
    next();
  };
}
