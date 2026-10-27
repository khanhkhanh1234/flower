import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';

const { PORT = '3000', DB_PATH, JWT_SECRET, ADMIN_PASSWORD, TRUST_PROXY } = process.env;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is missing or shorter than 32 characters. See server/.env.example');
  process.exit(1);
}
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('ADMIN_PASSWORD is missing or shorter than 8 characters. See server/.env.example');
  process.exit(1);
}

const db = openDb(DB_PATH || fileURLToPath(new URL('../data/shop.db', import.meta.url)));

const app = createApp({
  db,
  jwtSecret: JWT_SECRET,
  adminPassword: ADMIN_PASSWORD,
  clientDist: fileURLToPath(new URL('../../client/dist', import.meta.url)),
  trustProxy: TRUST_PROXY ? Number(TRUST_PROXY) || TRUST_PROXY : false,
});

const server = app.listen(Number(PORT), () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
