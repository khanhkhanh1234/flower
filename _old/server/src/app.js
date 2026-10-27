import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { errorHandler } from './http.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';

export function createApp({ db, jwtSecret, adminPassword, clientDist, trustProxy = false }) {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'https:'],
        },
      },
    })
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', adminRoutes(db, { jwtSecret, adminPassword }));
  app.use('/api', publicRoutes(db));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));
    app.get('/{*splat}', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
