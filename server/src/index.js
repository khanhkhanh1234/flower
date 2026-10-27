import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, TZ } from './db.js';
import { diskStorage, supabaseStorage } from './storage.js';
import { createApp } from './app.js';

process.env.TZ ||= TZ;
const env = process.env;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(env.DATA_DIR || path.join(root, 'data'));
const useSupabaseStorage = Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY);

// Render's disk is wiped on every restart: refuse to run there without external storage.
if (env.RENDER && (!env.DATABASE_URL || !useSupabaseStorage)) {
  console.error('Thiếu DATABASE_URL / SUPABASE_URL / SUPABASE_SECRET_KEY — dữ liệu sẽ bị mất khi Render khởi động lại.');
  process.exit(1);
}

const db = await openDb({ url: env.DATABASE_URL, dir: path.join(dataDir, 'pgdata') });
const storage = useSupabaseStorage
  ? supabaseStorage({ url: env.SUPABASE_URL, key: env.SUPABASE_SECRET_KEY, bucket: env.SUPABASE_BUCKET || undefined })
  : diskStorage(path.join(dataDir, 'uploads'));
await storage.init();

const app = createApp({
  db,
  storage,
  clientDist: path.resolve(root, '..', 'client', 'dist'),
  geminiKey: env.GEMINI_API_KEY || '',
});

const port = Number(env.PORT) || 3000;
const host = env.HOST || '127.0.0.1';
app.listen(port, host, () =>
  console.log(
    `Floral Muse chạy tại http://${host}:${port} (DB: ${env.DATABASE_URL ? 'Postgres' : 'PGlite nội bộ'}, ảnh: ${useSupabaseStorage ? 'Supabase Storage' : 'ổ đĩa'})`,
  ),
);
