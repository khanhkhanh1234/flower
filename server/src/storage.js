import fs from 'node:fs/promises';
import path from 'node:path';

/** Uploaded file names are always random hex + a known image extension. */
export const FILE_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const contentType = (file) => TYPES[file.split('.').pop()] || 'application/octet-stream';
/** Storage name of the small WebP thumbnail for an uploaded file. */
export const thumbName = (file) => `${file.split('.')[0]}_s.webp`;

/** Store images on local disk (dev / self-hosted VM). */
export function diskStorage(dir) {
  return {
    init: () => fs.mkdir(dir, { recursive: true }),
    put: (file, buf) => fs.writeFile(path.join(dir, file), buf),
    async get(file) {
      try {
        return await fs.readFile(path.join(dir, file));
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    remove: (file) => fs.rm(path.join(dir, file), { force: true }),
  };
}

/**
 * Store images in a private Supabase Storage bucket (REST API, server-side key).
 * Files are never public: the app proxies them to logged-in users only.
 */
export function supabaseStorage({ url, key, bucket = 'floral-uploads', fetchImpl = fetch }) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(bucket)) throw new Error('SUPABASE_BUCKET không hợp lệ');
  const base = `${url.replace(/\/+$/, '')}/storage/v1`;
  // New secret keys (sb_secret_...) go in `apikey`; legacy service_role JWTs also need Bearer.
  const auth = { apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}) };
  const call = (method, p, { body, headers } = {}) =>
    fetchImpl(`${base}${p}`, { method, body, headers: { ...auth, ...headers }, signal: AbortSignal.timeout(30000) });
  const fail = async (what, res) => {
    const text = await res.text().catch(() => '');
    return new Error(`Supabase Storage ${what} lỗi ${res.status}: ${text.slice(0, 200)}`);
  };
  const obj = (file) => `/object/${bucket}/${file}`;

  return {
    async init() {
      const res = await call('POST', '/bucket', {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: bucket,
          name: bucket,
          public: false,
          file_size_limit: 6 * 1024 * 1024,
          allowed_mime_types: Object.values(TYPES),
        }),
      });
      if (res.ok) return;
      const text = await res.text();
      if (!/already exists|duplicate/i.test(text)) throw new Error(`Không tạo được bucket: ${res.status} ${text.slice(0, 200)}`);
    },
    async put(file, buf) {
      const res = await call('POST', obj(file), {
        headers: { 'content-type': contentType(file), 'cache-control': 'max-age=604800' },
        body: buf,
      });
      if (!res.ok) throw await fail('tải lên', res);
    },
    async get(file) {
      const res = await call('GET', obj(file));
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      const text = await res.text().catch(() => '');
      if (res.status === 404 || (res.status === 400 && /not.?found/i.test(text))) return null;
      throw new Error(`Supabase Storage đọc lỗi ${res.status}: ${text.slice(0, 200)}`);
    },
    async remove(file) {
      const res = await call('DELETE', `/object/${bucket}`, {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: [file] }),
      });
      if (!res.ok) throw await fail('xóa', res);
    },
  };
}
