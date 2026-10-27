import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NOW } from './db.js';
import { FILE_RE, contentType } from './storage.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  authMiddleware,
  setSessionCookie,
  COOKIE,
  requireOwner,
  rateLimiter,
  EMAIL_RE,
} from './auth.js';
import { heuristicParse, geminiParse, finalizeDraft, buildReply } from './ai.js';
import { calcTotals, money } from './calc.js';

export const STATUSES = ['pending', 'making', 'delivering', 'done', 'cancelled'];
const DEPOSIT = ['none', 'partial', 'full'];
const MAX_IMAGES = 10;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);
const notFound = (msg = 'Không tìm thấy') => new HttpError(404, msg);

const str = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
const hhmm = (v) => (/^\d{2}:\d{2}$/.test(v || '') ? v : '');
const id = (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const likeEscape = (s) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const IMAGE_SIG = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

export function createApp({ db, storage, clientDist, geminiKey = '', fetchImpl = fetch, today = () => new Date() }) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

  // ---------- security headers / CSRF ----------
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin) {
        let host = '';
        try {
          host = new URL(origin).host;
        } catch {
          /* invalid origin */
        }
        if (host !== req.get('host')) return res.status(403).json({ error: 'Origin không hợp lệ' });
      }
    }
    next();
  });

  const smallJson = express.json({ limit: '1mb' });
  app.use((req, res, next) => (req.path === '/api/ai/parse' ? next() : smallJson(req, res, next)));

  const auth = authMiddleware(db);
  const loginLimiter = rateLimiter(10, 15 * 60 * 1000);
  const getSetting = async (k) => (await db.get('SELECT value FROM settings WHERE key = ?', k))?.value ?? '';
  const setSetting = (k, v) =>
    db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', k, v);
  const imageUrl = (file) => (file ? `/uploads/${file}` : null);

  app.get('/api/health', async (req, res) => {
    await db.get('SELECT 1');
    res.json({ ok: true });
  });

  // ---------- auth ----------
  app.get('/api/auth/state', async (req, res) => {
    const { n } = await db.get('SELECT COUNT(*) AS n FROM users');
    res.json({ needsSetup: n === 0 });
  });

  app.post('/api/auth/setup', async (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase();
    const password = String(req.body?.password || '');
    if (!EMAIL_RE.test(email)) throw bad('Email không hợp lệ');
    if (password.length < 8) throw bad('Mật khẩu tối thiểu 8 ký tự');
    const user = await db.tx(async (t) => {
      await t.run('LOCK TABLE users IN EXCLUSIVE MODE');
      if ((await t.get('SELECT COUNT(*) AS n FROM users')).n > 0) throw new HttpError(409, 'Tiệm đã được thiết lập');
      const r = await t.get(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'owner') RETURNING id",
        email,
        hashPassword(password),
      );
      return { id: r.id, email, role: 'owner' };
    });
    setSessionCookie(req, res, await createSession(db, user.id));
    res.status(201).json({ user });
  });

  app.post('/api/auth/login', async (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase();
    const password = String(req.body?.password || '');
    if (!loginLimiter(`${req.ip}|${email}`)) throw new HttpError(429, 'Thử lại sau ít phút');
    const u = await db.get('SELECT * FROM users WHERE email = ?', email);
    if (!u || !verifyPassword(password, u.password_hash)) throw new HttpError(401, 'Sai email hoặc mật khẩu');
    await db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
    setSessionCookie(req, res, await createSession(db, u.id));
    res.json({ user: { id: u.id, email: u.email, role: u.role } });
  });

  app.post('/api/auth/logout', auth, async (req, res) => {
    await db.run('DELETE FROM sessions WHERE token = ?', req.token);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

  app.post('/api/auth/password', auth, async (req, res) => {
    const current = String(req.body?.current || '');
    const next = String(req.body?.next || '');
    const u = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
    if (!verifyPassword(current, u.password_hash)) throw bad('Mật khẩu hiện tại không đúng');
    if (next.length < 8) throw bad('Mật khẩu mới tối thiểu 8 ký tự');
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), u.id);
    await db.run('DELETE FROM sessions WHERE user_id = ? AND token != ?', u.id, req.token);
    res.json({ ok: true });
  });

  // Everything below requires login.
  app.use('/api', (req, res, next) => (req.path === '/ai/parse' ? next() : auth(req, res, next)));
  app.get('/uploads/:file', auth, async (req, res) => {
    const file = req.params.file;
    const buf = FILE_RE.test(file) ? await storage.get(file) : null;
    if (!buf) throw notFound();
    res.set({ 'Content-Type': contentType(file), 'Cache-Control': 'private, max-age=604800, immutable' }).send(buf);
  });

  // ---------- users (owner manages staff logins) ----------
  app.get('/api/users', requireOwner, async (req, res) => {
    res.json(await db.all('SELECT id, email, role, created_at FROM users ORDER BY id'));
  });
  app.post('/api/users', requireOwner, async (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase();
    const password = String(req.body?.password || '');
    if (!EMAIL_RE.test(email)) throw bad('Email không hợp lệ');
    if (password.length < 8) throw bad('Mật khẩu tối thiểu 8 ký tự');
    const r = await db.get(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'staff') ON CONFLICT (email) DO NOTHING RETURNING id",
      email,
      hashPassword(password),
    );
    if (!r) throw new HttpError(409, 'Email đã tồn tại');
    res.status(201).json({ id: r.id, email, role: 'staff' });
  });
  app.delete('/api/users/:id', requireOwner, async (req, res) => {
    const uid = id(req.params.id);
    if (uid === req.user.id) throw bad('Không thể xóa chính mình');
    await db.run("DELETE FROM users WHERE id = ? AND role != 'owner'", uid);
    res.json({ ok: true });
  });

  // ---------- settings ----------
  app.get('/api/settings', async (req, res) => {
    res.json({
      ai_configured: Boolean((await getSetting('gemini_api_key')) || geminiKey),
      gemini_model: (await getSetting('gemini_model')) || 'gemini-flash-latest',
    });
  });
  app.put('/api/settings', requireOwner, async (req, res) => {
    if (req.body?.gemini_model !== undefined) {
      const m = str(req.body.gemini_model, 60);
      if (m && !/^[a-z0-9.\-]+$/i.test(m)) throw bad('Tên model không hợp lệ');
      await setSetting('gemini_model', m);
    }
    if (req.body?.gemini_api_key !== undefined) await setSetting('gemini_api_key', str(req.body.gemini_api_key, 200));
    res.json({ ok: true });
  });

  // ---------- image upload helper ----------
  const rawImage = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '6mb' });
  async function saveImage(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) throw bad('Ảnh không hợp lệ');
    const sig = IMAGE_SIG.find((s) => s.test(buf));
    if (!sig) throw bad('Chỉ hỗ trợ ảnh JPG, PNG, WEBP');
    const file = `${crypto.randomBytes(16).toString('hex')}.${sig.ext}`;
    await storage.put(file, buf);
    return file;
  }
  function removeFile(file) {
    if (!file || !FILE_RE.test(file)) return;
    storage.remove(file).catch((e) => console.error('Không xóa được ảnh', file, e.message));
  }

  // ---------- flowers ----------
  const flowerOut = (f) => f && { ...f, image_url: imageUrl(f.image) };
  const normFlower = (b) => {
    const name = str(b?.name, 120);
    if (!name) throw bad('Tên mẫu hoa là bắt buộc');
    return { name, price: money(b?.price), description: str(b?.description, 1000) };
  };
  app.get('/api/flowers', async (req, res) => {
    const q = str(req.query.q, 100);
    const rows = q
      ? await db.all("SELECT * FROM flowers WHERE deleted_at IS NULL AND name ILIKE ? ESCAPE '\\' ORDER BY name", likeEscape(q))
      : await db.all('SELECT * FROM flowers WHERE deleted_at IS NULL ORDER BY name');
    res.json(rows.map(flowerOut));
  });
  app.get('/api/flowers/:id', async (req, res) => {
    const f = await db.get('SELECT * FROM flowers WHERE id = ? AND deleted_at IS NULL', id(req.params.id));
    if (!f) throw notFound();
    const stats = await db.get(
      `SELECT COUNT(DISTINCT o.id) AS orders, COALESCE(SUM(i.qty),0) AS qty FROM order_items i
       JOIN orders o ON o.id = i.order_id WHERE i.flower_id = ? AND o.deleted_at IS NULL AND o.is_draft = 0 AND o.status != 'cancelled'`,
      f.id,
    );
    res.json({ ...flowerOut(f), stats });
  });
  app.post('/api/flowers', async (req, res) => {
    const f = normFlower(req.body);
    const row = await db.get(
      'INSERT INTO flowers (name, price, description) VALUES (?, ?, ?) RETURNING *',
      f.name,
      f.price,
      f.description,
    );
    res.status(201).json(flowerOut(row));
  });
  app.put('/api/flowers/:id', async (req, res) => {
    const f = normFlower(req.body);
    const row = await db.get(
      'UPDATE flowers SET name = ?, price = ?, description = ? WHERE id = ? AND deleted_at IS NULL RETURNING *',
      f.name,
      f.price,
      f.description,
      id(req.params.id),
    );
    if (!row) throw notFound();
    res.json(flowerOut(row));
  });
  app.delete('/api/flowers/:id', async (req, res) => {
    await db.run(`UPDATE flowers SET deleted_at = ${NOW} WHERE id = ?`, id(req.params.id));
    res.json({ ok: true });
  });
  app.post('/api/flowers/:id/image', rawImage, async (req, res) => {
    const f = await db.get('SELECT * FROM flowers WHERE id = ? AND deleted_at IS NULL', id(req.params.id));
    if (!f) throw notFound();
    const file = await saveImage(req.body);
    await db.run('UPDATE flowers SET image = ? WHERE id = ?', file, f.id);
    removeFile(f.image);
    res.json(flowerOut({ ...f, image: file }));
  });

  // ---------- customers ----------
  app.get('/api/customers', async (req, res) => {
    const q = str(req.query.q, 100);
    const where = q ? "AND (c.name ILIKE ? ESCAPE '\\' OR c.phone ILIKE ? ESCAPE '\\')" : '';
    const args = q ? [likeEscape(q), likeEscape(q)] : [];
    const rows = await db.all(
      `SELECT c.*, COUNT(o.id) AS order_count, MAX(o.delivery_date) AS last_order
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.deleted_at IS NULL AND o.is_draft = 0
       WHERE c.deleted_at IS NULL ${where} GROUP BY c.id ORDER BY c.name LIMIT 500`,
      ...args,
    );
    res.json(rows);
  });
  app.get('/api/customers/:id', async (req, res) => {
    const c = await db.get('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', id(req.params.id));
    if (!c) throw notFound();
    const orders = (
      await db.all(
        'SELECT * FROM orders WHERE customer_id = ? AND deleted_at IS NULL AND is_draft = 0 ORDER BY delivery_date DESC, id DESC',
        c.id,
      )
    ).map(orderSummary);
    const spent = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.totals.total, 0);
    res.json({ ...c, orders, spent });
  });
  const normCustomer = (b) => {
    const name = str(b?.name, 100);
    if (!name) throw bad('Tên khách là bắt buộc');
    return { name, phone: str(b?.phone, 20), address: str(b?.address, 300), note: str(b?.note, 1000) };
  };
  app.post('/api/customers', async (req, res) => {
    const c = normCustomer(req.body);
    const row = await db.get(
      'INSERT INTO customers (name, phone, address, note) VALUES (?, ?, ?, ?) RETURNING *',
      c.name,
      c.phone,
      c.address,
      c.note,
    );
    res.status(201).json(row);
  });
  app.put('/api/customers/:id', async (req, res) => {
    const c = normCustomer(req.body);
    const row = await db.get(
      'UPDATE customers SET name = ?, phone = ?, address = ?, note = ? WHERE id = ? AND deleted_at IS NULL RETURNING *',
      c.name,
      c.phone,
      c.address,
      c.note,
      id(req.params.id),
    );
    if (!row) throw notFound();
    res.json(row);
  });
  app.delete('/api/customers/:id', async (req, res) => {
    await db.run(`UPDATE customers SET deleted_at = ${NOW} WHERE id = ?`, id(req.params.id));
    res.json({ ok: true });
  });

  // ---------- branches & staff ----------
  app.get('/api/branches', async (req, res) => {
    res.json(await db.all('SELECT * FROM branches WHERE deleted_at IS NULL ORDER BY name'));
  });
  app.post('/api/branches', async (req, res) => {
    const name = str(req.body?.name, 100);
    if (!name) throw bad('Tên cơ sở là bắt buộc');
    res.status(201).json(await db.get('INSERT INTO branches (name, address) VALUES (?, ?) RETURNING *', name, str(req.body?.address, 300)));
  });
  app.put('/api/branches/:id', async (req, res) => {
    const name = str(req.body?.name, 100);
    if (!name) throw bad('Tên cơ sở là bắt buộc');
    const row = await db.get(
      'UPDATE branches SET name = ?, address = ? WHERE id = ? RETURNING *',
      name,
      str(req.body?.address, 300),
      id(req.params.id),
    );
    if (!row) throw notFound();
    res.json(row);
  });
  app.delete('/api/branches/:id', async (req, res) => {
    await db.run(`UPDATE branches SET deleted_at = ${NOW} WHERE id = ?`, id(req.params.id));
    res.json({ ok: true });
  });
  app.get('/api/staff', async (req, res) => {
    const b = id(req.query.branch_id);
    const rows = await db.all(
      `SELECT s.*, b.name AS branch_name FROM staff s LEFT JOIN branches b ON b.id = s.branch_id
       WHERE s.deleted_at IS NULL ${b ? 'AND s.branch_id = ?' : ''} ORDER BY s.name`,
      ...(b ? [b] : []),
    );
    res.json(rows);
  });
  const normStaff = async (b) => {
    const name = str(b?.name, 100);
    if (!name) throw bad('Tên nhân viên là bắt buộc');
    const branch_id = id(b?.branch_id);
    if (branch_id && !(await db.get('SELECT 1 FROM branches WHERE id = ? AND deleted_at IS NULL', branch_id)))
      throw bad('Cơ sở không tồn tại');
    return { name, phone: str(b?.phone, 20), branch_id };
  };
  app.post('/api/staff', async (req, res) => {
    const s = await normStaff(req.body);
    res
      .status(201)
      .json(await db.get('INSERT INTO staff (name, phone, branch_id) VALUES (?, ?, ?) RETURNING *', s.name, s.phone, s.branch_id));
  });
  app.put('/api/staff/:id', async (req, res) => {
    const s = await normStaff(req.body);
    const row = await db.get(
      'UPDATE staff SET name = ?, phone = ?, branch_id = ? WHERE id = ? RETURNING *',
      s.name,
      s.phone,
      s.branch_id,
      id(req.params.id),
    );
    if (!row) throw notFound();
    res.json(row);
  });
  app.delete('/api/staff/:id', async (req, res) => {
    await db.run(`UPDATE staff SET deleted_at = ${NOW} WHERE id = ?`, id(req.params.id));
    res.json({ ok: true });
  });

  // ---------- orders ----------
  function orderSummary(o) {
    return { ...o, is_draft: Boolean(o.is_draft), totals: calcTotals(o) };
  }

  async function getOrder(oid) {
    const o = await db.get(
      `SELECT o.*, b.name AS branch_name, s.name AS staff_name FROM orders o
       LEFT JOIN branches b ON b.id = o.branch_id LEFT JOIN staff s ON s.id = o.staff_id WHERE o.id = ?`,
      oid,
    );
    if (!o) return null;
    const [items, images, events] = await Promise.all([
      db.all(
        `SELECT i.*, f.image AS flower_image FROM order_items i LEFT JOIN flowers f ON f.id = i.flower_id
         WHERE i.order_id = ? ORDER BY i.id`,
        oid,
      ),
      db.all('SELECT id, path FROM order_images WHERE order_id = ? ORDER BY id', oid),
      db.all('SELECT status, by_user, created_at FROM order_events WHERE order_id = ? ORDER BY id', oid),
    ]);
    return {
      ...orderSummary(o),
      items: items.map(({ flower_image, ...i }) => ({ ...i, image_url: imageUrl(flower_image) })),
      images: images.map((i) => ({ id: i.id, url: imageUrl(i.path) })),
      events,
    };
  }

  async function normOrder(b, { draft }) {
    const order_for = b?.order_for === 'gift' ? 'gift' : 'self';
    const o = {
      order_for,
      customer_id: id(b?.customer_id),
      customer_name: str(b?.customer_name, 100),
      customer_phone: str(b?.customer_phone, 20),
      recipient_name: order_for === 'gift' ? str(b?.recipient_name, 100) : '',
      recipient_phone: order_for === 'gift' ? str(b?.recipient_phone, 20) : '',
      address: str(b?.address, 300),
      delivery_date: isoDate(b?.delivery_date),
      delivery_time: hhmm(b?.delivery_time),
      platform: str(b?.platform, 50),
      price: money(b?.price),
      ship_fee: money(b?.ship_fee),
      discount: money(b?.discount),
      discount_type: b?.discount_type === 'percent' ? 'percent' : 'vnd',
      extra_cost: money(b?.extra_cost),
      deposit_status: DEPOSIT.includes(b?.deposit_status) ? b.deposit_status : 'none',
      deposit_amount: money(b?.deposit_amount),
      product_summary: str(b?.product_summary, 1000),
      branch_id: id(b?.branch_id),
      staff_id: id(b?.staff_id),
      note: str(b?.note, 2000),
    };
    if (o.discount_type === 'percent') o.discount = Math.min(100, o.discount);
    if (o.deposit_status === 'none') o.deposit_amount = 0;
    const items = (Array.isArray(b?.items) ? b.items : []).slice(0, 50).map((it) => ({
      flower_id: id(it?.flower_id),
      name: str(it?.name, 120),
      unit_price: money(it?.unit_price),
      qty: Math.max(1, Math.min(9999, money(it?.qty) || 1)),
    }));
    if (items.some((it) => !it.name)) throw bad('Sản phẩm thiếu tên');
    if (o.customer_id && !(await db.get('SELECT 1 FROM customers WHERE id = ? AND deleted_at IS NULL', o.customer_id)))
      throw bad('Khách hàng không tồn tại');
    if (o.branch_id && !(await db.get('SELECT 1 FROM branches WHERE id = ?', o.branch_id))) throw bad('Cơ sở không tồn tại');
    if (o.staff_id && !(await db.get('SELECT 1 FROM staff WHERE id = ?', o.staff_id))) throw bad('Nhân viên không tồn tại');
    if (!draft) {
      if (!o.customer_name) throw bad('Tên khách là bắt buộc');
      if (order_for === 'gift' && !o.recipient_name) throw bad('Tên người nhận là bắt buộc');
      if (!o.delivery_date) throw bad('Ngày giao là bắt buộc');
      if (!o.product_summary) throw bad('Mô tả hoa là bắt buộc');
    }
    return { o, items };
  }

  /** Link the order to a customer record (create one if new). Recipients are never added. */
  async function ensureCustomer(t, o) {
    if (o.customer_id) return o.customer_id;
    if (!o.customer_name) return null;
    if (o.customer_phone) {
      const c = await t.get('SELECT id FROM customers WHERE phone = ? AND deleted_at IS NULL ORDER BY id LIMIT 1', o.customer_phone);
      if (c) return c.id;
    }
    const r = await t.get(
      'INSERT INTO customers (name, phone, address) VALUES (?, ?, ?) RETURNING id',
      o.customer_name,
      o.customer_phone,
      o.order_for === 'self' ? o.address : '',
    );
    return r.id;
  }

  const ORDER_COLS = [
    'order_for', 'customer_id', 'customer_name', 'customer_phone', 'recipient_name', 'recipient_phone', 'address',
    'delivery_date', 'delivery_time', 'platform', 'price', 'ship_fee', 'discount', 'discount_type', 'extra_cost',
    'deposit_status', 'deposit_amount', 'product_summary', 'branch_id', 'staff_id', 'note',
  ];

  async function writeItems(t, oid, items) {
    await t.run('DELETE FROM order_items WHERE order_id = ?', oid);
    if (!items.length) return;
    await t.run(
      `INSERT INTO order_items (order_id, flower_id, name, unit_price, qty) VALUES ${items.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
      ...items.flatMap((it) => [oid, it.flower_id, it.name, it.unit_price, it.qty]),
    );
  }

  app.get('/api/orders', async (req, res) => {
    const where = [];
    const args = [];
    where.push(req.query.trash === '1' ? 'o.deleted_at IS NOT NULL' : 'o.deleted_at IS NULL');
    if (req.query.trash !== '1') where.push(`o.is_draft = ${req.query.draft === '1' ? 1 : 0}`);
    if (isoDate(req.query.date)) {
      where.push('o.delivery_date = ?');
      args.push(req.query.date);
    }
    if (isoDate(req.query.from)) {
      where.push('o.delivery_date >= ?');
      args.push(req.query.from);
    }
    if (isoDate(req.query.to)) {
      where.push('o.delivery_date <= ?');
      args.push(req.query.to);
    }
    if (STATUSES.includes(req.query.status)) {
      where.push('o.status = ?');
      args.push(req.query.status);
    }
    if (id(req.query.customer_id)) {
      where.push('o.customer_id = ?');
      args.push(id(req.query.customer_id));
    }
    const q = str(req.query.q, 100);
    if (q) {
      where.push(
        "(o.customer_name ILIKE ? ESCAPE '\\' OR o.customer_phone ILIKE ? ESCAPE '\\' OR o.recipient_name ILIKE ? ESCAPE '\\' OR o.recipient_phone ILIKE ? ESCAPE '\\' OR o.product_summary ILIKE ? ESCAPE '\\' OR CAST(o.id AS TEXT) = ?)",
      );
      const l = likeEscape(q);
      args.push(l, l, l, l, l, q.replace(/^#/, ''));
    }
    const order =
      req.query.trash === '1'
        ? 'o.deleted_at DESC'
        : req.query.draft === '1'
          ? 'o.updated_at DESC'
          : isoDate(req.query.date)
            ? "o.status = 'cancelled', o.status = 'done', COALESCE(NULLIF(o.delivery_time,''),'99:99'), o.id"
            : 'o.delivery_date DESC, o.id DESC';
    const rows = await db.all(
      `SELECT o.*, (SELECT path FROM order_images WHERE order_id = o.id ORDER BY id LIMIT 1) AS thumb,
              (SELECT COUNT(*) FROM order_images WHERE order_id = o.id) AS image_count
       FROM orders o WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 500`,
      ...args,
    );
    res.json(rows.map(({ thumb, ...o }) => ({ ...orderSummary(o), thumb_url: imageUrl(thumb) })));
  });

  app.get('/api/orders/:id', async (req, res) => {
    const o = await getOrder(id(req.params.id));
    if (!o) throw notFound('Không tìm thấy đơn');
    res.json(o);
  });

  app.post('/api/orders', async (req, res) => {
    const draft = req.body?.is_draft === true;
    const { o, items } = await normOrder(req.body, { draft });
    const oid = await db.tx(async (t) => {
      if (!draft) o.customer_id = await ensureCustomer(t, o);
      const r = await t.get(
        `INSERT INTO orders (${ORDER_COLS.join(', ')}, is_draft, created_by) VALUES (${ORDER_COLS.map(() => '?').join(', ')}, ?, ?) RETURNING id`,
        ...ORDER_COLS.map((c) => o[c]),
        draft ? 1 : 0,
        req.user.email,
      );
      await writeItems(t, r.id, items);
      if (!draft) await t.run("INSERT INTO order_events (order_id, status, by_user) VALUES (?, 'pending', ?)", r.id, req.user.email);
      return r.id;
    });
    res.status(201).json(await getOrder(oid));
  });

  app.put('/api/orders/:id', async (req, res) => {
    const oid = id(req.params.id);
    const cur = await db.get('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL', oid);
    if (!cur) throw notFound('Không tìm thấy đơn');
    // A draft stays a draft unless explicitly published; a real order can't go back to draft.
    const draft = Boolean(cur.is_draft) && req.body?.is_draft !== false;
    const { o, items } = await normOrder(req.body, { draft });
    await db.tx(async (t) => {
      if (!draft) o.customer_id = await ensureCustomer(t, o);
      await t.run(
        `UPDATE orders SET ${ORDER_COLS.map((c) => `${c} = ?`).join(', ')}, is_draft = ?, updated_at = ${NOW} WHERE id = ?`,
        ...ORDER_COLS.map((c) => o[c]),
        draft ? 1 : 0,
        oid,
      );
      if (cur.is_draft && !draft) {
        await t.run(`UPDATE orders SET created_at = ${NOW}, created_by = ? WHERE id = ?`, req.user.email, oid);
        await t.run("INSERT INTO order_events (order_id, status, by_user) VALUES (?, 'pending', ?)", oid, req.user.email);
      }
      await writeItems(t, oid, items);
    });
    res.json(await getOrder(oid));
  });

  app.post('/api/orders/:id/status', async (req, res) => {
    const oid = id(req.params.id);
    const status = req.body?.status;
    if (!STATUSES.includes(status)) throw bad('Trạng thái không hợp lệ');
    const cur = await db.get('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL AND is_draft = 0', oid);
    if (!cur) throw notFound('Không tìm thấy đơn');
    if (cur.status !== status) {
      await db.tx(async (t) => {
        await t.run(`UPDATE orders SET status = ?, updated_at = ${NOW} WHERE id = ?`, status, oid);
        await t.run('INSERT INTO order_events (order_id, status, by_user) VALUES (?, ?, ?)', oid, status, req.user.email);
      });
    }
    res.json(await getOrder(oid));
  });

  app.delete('/api/orders/:id', async (req, res) => {
    await db.run(`UPDATE orders SET deleted_at = ${NOW} WHERE id = ? AND deleted_at IS NULL`, id(req.params.id));
    res.json({ ok: true });
  });
  app.post('/api/orders/:id/restore', async (req, res) => {
    await db.run('UPDATE orders SET deleted_at = NULL WHERE id = ?', id(req.params.id));
    res.json(await getOrder(id(req.params.id)));
  });
  async function purge(oid) {
    const imgs = await db.all('SELECT path FROM order_images WHERE order_id = ?', oid);
    const r = await db.run('DELETE FROM orders WHERE id = ? AND deleted_at IS NOT NULL', oid);
    if (r.changes) imgs.forEach((i) => removeFile(i.path));
  }
  app.delete('/api/orders/:id/purge', async (req, res) => {
    await purge(id(req.params.id));
    res.json({ ok: true });
  });
  app.post('/api/trash/empty', async (req, res) => {
    for (const r of await db.all('SELECT id FROM orders WHERE deleted_at IS NOT NULL')) await purge(r.id);
    res.json({ ok: true });
  });

  app.post('/api/orders/:id/images', rawImage, async (req, res) => {
    const oid = id(req.params.id);
    if (!(await db.get('SELECT 1 FROM orders WHERE id = ? AND deleted_at IS NULL', oid))) throw notFound('Không tìm thấy đơn');
    if ((await db.get('SELECT COUNT(*) AS n FROM order_images WHERE order_id = ?', oid)).n >= MAX_IMAGES)
      throw bad(`Tối đa ${MAX_IMAGES} ảnh mỗi đơn`);
    const file = await saveImage(req.body);
    const r = await db.get('INSERT INTO order_images (order_id, path) VALUES (?, ?) RETURNING id', oid, file);
    res.status(201).json({ id: r.id, url: imageUrl(file) });
  });
  app.delete('/api/orders/:id/images/:imageId', async (req, res) => {
    const img = await db.get(
      'DELETE FROM order_images WHERE id = ? AND order_id = ? RETURNING path',
      id(req.params.imageId),
      id(req.params.id),
    );
    if (!img) throw notFound();
    removeFile(img.path);
    res.json({ ok: true });
  });

  // ---------- import notes ----------
  app.get('/api/import-notes/:date', async (req, res) => {
    const d = isoDate(req.params.date);
    if (!d) throw bad('Ngày không hợp lệ');
    res.json({ date: d, content: (await db.get('SELECT content FROM import_notes WHERE date = ?', d))?.content || '' });
  });
  app.put('/api/import-notes/:date', async (req, res) => {
    const d = isoDate(req.params.date);
    if (!d) throw bad('Ngày không hợp lệ');
    const content = str(req.body?.content, 5000);
    await db.run(
      'INSERT INTO import_notes (date, content) VALUES (?, ?) ON CONFLICT (date) DO UPDATE SET content = excluded.content',
      d,
      content,
    );
    res.json({ date: d, content });
  });

  // ---------- stats & reports ----------
  const activeOrders = (from, to) =>
    db.all(
      'SELECT * FROM orders WHERE deleted_at IS NULL AND is_draft = 0 AND delivery_date >= ? AND delivery_date <= ? ORDER BY delivery_date',
      from,
      to,
    );

  app.get('/api/stats/day', async (req, res) => {
    const d = isoDate(req.query.date);
    if (!d) throw bad('Ngày không hợp lệ');
    const rows = await activeOrders(d, d);
    const by_status = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    let revenue = 0;
    for (const o of rows) {
      by_status[o.status]++;
      if (o.status !== 'cancelled') revenue += calcTotals(o).revenue;
    }
    res.json({ date: d, count: rows.length, revenue, by_status });
  });

  app.get('/api/reports', async (req, res) => {
    const from = isoDate(req.query.from);
    const to = isoDate(req.query.to);
    if (!from || !to || from > to) throw bad('Khoảng ngày không hợp lệ');
    const rows = await activeOrders(from, to);
    const days = new Map();
    const platforms = new Map();
    const staffMap = new Map();
    const staffNames = new Map((await db.all('SELECT id, name FROM staff')).map((s) => [s.id, s.name]));
    const r = { from, to, order_count: 0, cancelled_count: 0, revenue: 0, total: 0, ship_total: 0, discount_total: 0, remaining_total: 0 };
    const add = (map, key, t) => {
      const v = map.get(key) || { name: key, count: 0, revenue: 0 };
      v.count++;
      v.revenue += t.revenue;
      map.set(key, v);
    };
    for (const o of rows) {
      if (o.status === 'cancelled') {
        r.cancelled_count++;
        continue;
      }
      const t = calcTotals(o);
      r.order_count++;
      r.revenue += t.revenue;
      r.total += t.total;
      r.ship_total += t.ship;
      r.discount_total += t.discount;
      if (o.status !== 'done') r.remaining_total += t.remaining;
      const day = days.get(o.delivery_date) || { date: o.delivery_date, count: 0, revenue: 0 };
      day.count++;
      day.revenue += t.revenue;
      days.set(o.delivery_date, day);
      add(platforms, o.platform || 'Không rõ', t);
      add(staffMap, staffNames.get(o.staff_id) || 'Chưa gán', t);
    }
    const top = await db.all(
      `SELECT i.name, SUM(i.qty) AS qty, SUM(i.qty::bigint * i.unit_price)::float8 AS amount FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.deleted_at IS NULL AND o.is_draft = 0 AND o.status != 'cancelled' AND o.delivery_date >= ? AND o.delivery_date <= ?
       GROUP BY i.name ORDER BY 2 DESC, i.name LIMIT 10`,
      from,
      to,
    );
    const sortRev = (m) => [...m.values()].sort((a, b) => b.revenue - a.revenue);
    res.json({ ...r, days: [...days.values()], by_platform: sortRev(platforms), by_staff: sortRev(staffMap), top_flowers: top });
  });

  // ---------- AI ----------
  app.post('/api/ai/parse', auth, express.json({ limit: '25mb' }), async (req, res) => {
    const messages = (Array.isArray(req.body?.messages) ? req.body.messages : []).slice(0, 20).map((m) => ({
      text: str(m?.text, 5000),
      images: (Array.isArray(m?.images) ? m.images : []).slice(0, 10).filter((s) => typeof s === 'string'),
    }));
    if (!messages.some((m) => m.text || m.images.length)) throw bad('Chưa có nội dung để đọc');
    const flowers = await db.all('SELECT id, name, price FROM flowers WHERE deleted_at IS NULL');
    const now = today();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const apiKey = (await getSetting('gemini_api_key')) || geminiKey;
    const model = (await getSetting('gemini_model')) || 'gemini-flash-latest';
    const text = messages.map((m) => m.text).filter(Boolean).join('\n');
    let raw;
    let source = 'heuristic';
    let warning = '';
    if (apiKey) {
      try {
        raw = await geminiParse({
          apiKey,
          model,
          messages,
          flowers,
          today: todayStr,
          fetchImpl,
        });
        source = 'gemini';
      } catch (e) {
        warning = `AI lỗi, dùng bộ đọc cơ bản: ${e.message}`;
      }
    } else if (messages.some((m) => m.images.length) && !text) {
      warning = 'Chưa cấu hình Gemini API key nên chưa đọc được ảnh — hãy dán thêm nội dung chữ.';
    }
    if (!raw) raw = heuristicParse(text, flowers, now);
    const data = finalizeDraft(raw);
    res.json({ data, reply: buildReply(data), source, warning });
  });

  // ---------- errors & SPA ----------
  app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy API' }));
  if (clientDist && fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu quá lớn' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  });

  return app;
}
