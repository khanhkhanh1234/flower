import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { diskStorage, supabaseStorage } from '../src/storage.js';
import { createApp } from '../src/app.js';
import { heuristicParse, finalizeDraft, parseMoney } from '../src/ai.js';
import { calcTotals } from '../src/calc.js';

let server;
let base;
let tmp;
let cookie = '';
const dbs = [];

async function freshDb() {
  // Optional: TEST_DATABASE_URL=postgres://... runs the suite on a real Postgres (one new database per app).
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return openDb();
  const { default: pg } = await import('pg');
  const name = `fm_test_${Date.now()}_${dbs.length}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const u = new URL(url);
  u.pathname = `/${name}`;
  return openDb({ url: u.toString() });
}

async function makeApp(dir, opts = {}) {
  const db = await freshDb();
  dbs.push(db);
  const storage = diskStorage(path.join(tmp, dir));
  await storage.init();
  return createApp({ db, storage, ...opts });
}

async function api(method, url, body, { raw, type, noCookie } = {}) {
  const headers = {};
  if (cookie && !noCookie) headers.cookie = cookie;
  let payload;
  if (raw) {
    headers['content-type'] = type;
    payload = raw;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + url, { method, headers, body: payload });
  const set = res.headers.get('set-cookie');
  if (set && !noCookie) cookie = set.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text() };
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-'));
  const app = await makeApp('up', { today: () => new Date(2026, 9, 18) });
  await new Promise((r) => {
    server = app.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  for (const db of dbs) await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('supabase storage adapter sends secret key server-side only', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, ...opts });
    if (opts.method === 'GET') return new Response('{"statusCode":"404","error":"not_found"}', { status: 400 });
    if (url.endsWith('/bucket')) return new Response('{"message":"The resource already exists"}', { status: 409 });
    return new Response('{}', { status: 200 });
  };
  const s = supabaseStorage({ url: 'https://x.supabase.co/', key: 'sb_secret_abc', fetchImpl: fakeFetch });
  await s.init();
  await s.put('a'.repeat(32) + '.png', PNG);
  assert.equal(await s.get('b'.repeat(32) + '.png'), null);
  await s.remove('a'.repeat(32) + '.png');
  assert.equal(calls[0].url, 'https://x.supabase.co/storage/v1/bucket');
  assert.equal(JSON.parse(calls[0].body).public, false);
  assert.equal(calls[1].url, `https://x.supabase.co/storage/v1/object/floral-uploads/${'a'.repeat(32)}.png`);
  assert.equal(calls[1].headers['content-type'], 'image/png');
  assert.ok(calls.every((c) => c.headers.apikey === 'sb_secret_abc' && !c.headers.authorization));
  assert.deepEqual(JSON.parse(calls[3].body), { prefixes: [`${'a'.repeat(32)}.png`] });
});

test('money parsing & totals', () => {
  assert.equal(parseMoney('1tr1'), 1100000);
  assert.equal(parseMoney('50k'), 50000);
  assert.equal(parseMoney('1.600.000'), 1600000);
  const t = calcTotals({ price: 1000000, ship_fee: 50000, extra_cost: 20000, discount: 10, discount_type: 'percent', deposit_status: 'partial', deposit_amount: 300000 });
  assert.deepEqual([t.discount, t.total, t.remaining, t.revenue], [100000, 970000, 670000, 920000]);
});

test('heuristic parser reads the sample chat', () => {
  const t =
    'Cho mình đặt 4 bó hoa hồng đỏ và 2 bó lan trắng\ntổng tiền của anh là 1tr1, tiền ship 50k\nMinh Trí, sdt mình là 034567892\nshop đặt giao cho Bảo Ngọc, 0912345678 ở 18 Võ Quảng nhé\nNote là: chúc mừng 20/10\nshop xin cọc 50% nhé ạ';
  const d = finalizeDraft(heuristicParse(t, []));
  assert.equal(d.order_for, 'gift');
  assert.equal(d.customer_name, 'Minh Trí');
  assert.equal(d.recipient_phone, '0912345678');
  assert.equal(d.address, '18 Võ Quảng');
  assert.equal(d.price, 1100000);
  assert.equal(d.deposit_amount, 575000);
  assert.equal(d.items.length, 2);
});

test('requires login', async () => {
  assert.equal((await api('GET', '/api/orders', undefined, { noCookie: true })).status, 401);
  assert.equal((await api('POST', '/api/client-errors', { message: 'x' }, { noCookie: true })).status, 401);
  assert.equal((await api('GET', '/api/auth/state')).body.needsSetup, true);
});

test('setup, login, wrong password', async () => {
  let r = await api('POST', '/api/auth/setup', { email: 'owner@shop.vn', password: 'short' });
  assert.equal(r.status, 400);
  r = await api('POST', '/api/auth/setup', { email: 'owner@shop.vn', password: 'matkhau123' });
  assert.equal(r.status, 201);
  r = await api('POST', '/api/auth/setup', { email: 'x@shop.vn', password: 'matkhau123' }, { noCookie: true });
  assert.equal(r.status, 409);
  r = await api('POST', '/api/auth/login', { email: 'owner@shop.vn', password: 'sai-mat-khau' }, { noCookie: true });
  assert.equal(r.status, 401);
  r = await api('GET', '/api/auth/me');
  assert.equal(r.body.user.role, 'owner');
  assert.equal((await api('POST', '/api/client-errors', { kind: 'render', message: 'boom', stack: 'x'.repeat(9000) })).status, 204);
  const logged = (await api('GET', '/api/client-errors')).body;
  assert.equal(logged[0].message, 'boom');
  assert.equal(logged[0].stack.length, 4000);
  assert.equal(logged[0].by_user, 'owner@shop.vn');
});

test('rejects cross-origin writes', async () => {
  const res = await fetch(`${base}/api/flowers`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ name: 'X' }),
  });
  assert.equal(res.status, 403);
});

let rose;
let branch;
let staff;
test('flowers, branches, staff', async () => {
  rose = (await api('POST', '/api/flowers', { name: 'Hoa hồng đỏ', price: 250000 })).body;
  await api('POST', '/api/flowers', { name: 'Hoa lan trắng', price: 300000 });
  assert.equal((await api('GET', '/api/flowers?q=lan')).body.length, 1);
  const img = await api('POST', `/api/flowers/${rose.id}/image`, undefined, { raw: PNG, type: 'image/png' });
  assert.match(img.body.image_url, /^\/uploads\/[a-f0-9]{32}\.png$/);
  const bad = await api('POST', `/api/flowers/${rose.id}/image`, undefined, { raw: Buffer.from('<svg></svg>xxxxxxx'), type: 'image/png' });
  assert.equal(bad.status, 400);
  branch = (await api('POST', '/api/branches', { name: 'Cơ sở 1' })).body;
  staff = (await api('POST', '/api/staff', { name: 'Lan', branch_id: branch.id })).body;
  assert.equal((await api('GET', `/api/staff?branch_id=${branch.id}`)).body.length, 1);
});

let order;
test('create order, validation, customer auto-created', async () => {
  const base = {
    order_for: 'gift',
    customer_name: 'Minh Trí',
    customer_phone: '034567892',
    recipient_name: 'Bảo Ngọc',
    recipient_phone: '0912345678',
    address: '18 Võ Quảng',
    delivery_date: '2026-10-20',
    price: 1100000,
    ship_fee: 50000,
    deposit_status: 'partial',
    deposit_amount: 575000,
    product_summary: '4 bó hồng đỏ, 2 bó lan trắng',
    items: [{ flower_id: rose.id, name: 'Hoa hồng đỏ', unit_price: 250000, qty: 4 }],
    branch_id: branch.id,
    staff_id: staff.id,
  };
  assert.equal((await api('POST', '/api/orders', { ...base, delivery_date: '' })).status, 400);
  const r = await api('POST', '/api/orders', base);
  assert.equal(r.status, 201);
  order = r.body;
  assert.equal(order.totals.total, 1150000);
  assert.equal(order.totals.remaining, 575000);
  assert.equal(order.events[0].status, 'pending');
  assert.equal(order.staff_name, 'Lan');
  const customers = (await api('GET', '/api/customers')).body;
  assert.equal(customers.length, 1, 'recipient must not become a customer');
  assert.equal(customers[0].order_count, 1);
  // Same phone reuses the customer
  await api('POST', '/api/orders', { ...base, order_for: 'self' });
  assert.equal((await api('GET', '/api/customers')).body.length, 1);
});

test('order images: upload, limit, auth-protected file', async () => {
  const up = await api('POST', `/api/orders/${order.id}/images`, undefined, { raw: PNG, type: 'image/png' });
  assert.equal(up.status, 201);
  assert.equal((await fetch(base + up.body.url)).status, 401);
  assert.equal((await fetch(base + up.body.url, { headers: { cookie } })).status, 200);
  const [t1, t2] = await Promise.all([1, 2].map(() => fetch(`${base}${up.body.url}?s=1`, { headers: { cookie } })));
  assert.equal(t1.headers.get('content-type'), 'image/webp');
  assert.equal(t2.status, 200);
  assert.equal((await fetch(`${base}${up.body.url}?s=1`)).status, 401);
  const tfile = path.join(tmp, 'up', up.body.url.split('/').pop().replace('.png', '_s.webp'));
  assert.ok(fs.existsSync(tfile), 'thumbnail cached in storage');
  for (let i = 0; i < 9; i++) await api('POST', `/api/orders/${order.id}/images`, undefined, { raw: PNG, type: 'image/png' });
  assert.equal((await api('POST', `/api/orders/${order.id}/images`, undefined, { raw: PNG, type: 'image/png' })).status, 400);
  const del = await api('DELETE', `/api/orders/${order.id}/images/${up.body.id}`);
  assert.equal(del.status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!fs.existsSync(tfile), 'thumbnail removed with the image');
});

test('status flow, day stats, reports', async () => {
  for (const s of ['making', 'delivering', 'done']) await api('POST', `/api/orders/${order.id}/status`, { status: s });
  const o = (await api('GET', `/api/orders/${order.id}`)).body;
  assert.deepEqual(o.events.map((e) => e.status), ['pending', 'making', 'delivering', 'done']);
  assert.equal((await api('POST', `/api/orders/${order.id}/status`, { status: 'nope' })).status, 400);
  const day = (await api('GET', '/api/stats/day?date=2026-10-20')).body;
  assert.equal(day.count, 2);
  assert.equal(day.by_status.done, 1);
  assert.equal(day.revenue, 2200000);
  const rep = (await api('GET', '/api/reports?from=2026-10-01&to=2026-10-31')).body;
  assert.equal(rep.order_count, 2);
  assert.equal(rep.top_flowers[0].qty, 8);
  assert.equal((await api('GET', '/api/orders?date=2026-10-20&status=done')).body.length, 1);
  assert.equal((await api('GET', '/api/orders?q=Bảo')).body.length, 1);
});

test('drafts: save incomplete, then publish', async () => {
  const d = (await api('POST', '/api/orders', { is_draft: true, customer_name: 'Nháp' })).body;
  assert.equal(d.is_draft, true);
  assert.equal((await api('GET', '/api/orders?draft=1')).body.length, 1);
  assert.equal((await api('PUT', `/api/orders/${d.id}`, { customer_name: 'Nháp', is_draft: false })).status, 400);
  const p = await api('PUT', `/api/orders/${d.id}`, {
    customer_name: 'Nháp',
    delivery_date: '2026-10-21',
    product_summary: 'Bó hồng',
    is_draft: false,
  });
  assert.equal(p.body.is_draft, false);
  assert.equal(p.body.events.length, 1);
  assert.equal((await api('GET', '/api/orders?draft=1')).body.length, 0);
});

test('trash: delete, restore, purge', async () => {
  await api('DELETE', `/api/orders/${order.id}`);
  assert.equal((await api('GET', '/api/orders?trash=1')).body.length, 1);
  await api('POST', `/api/orders/${order.id}/restore`);
  assert.equal((await api('GET', '/api/orders?trash=1')).body.length, 0);
  await api('DELETE', `/api/orders/${order.id}`);
  await api('POST', '/api/trash/empty');
  assert.equal((await api('GET', `/api/orders/${order.id}`)).status, 404);
});

test('import notes', async () => {
  await api('PUT', '/api/import-notes/2026-10-20', { content: 'Nhập 50 hồng đỏ' });
  assert.equal((await api('GET', '/api/import-notes/2026-10-20')).body.content, 'Nhập 50 hồng đỏ');
});

test('AI parse: heuristic without key, gemini with key', async () => {
  let r = await api('POST', '/api/ai/parse', { messages: [{ text: 'Lan, sdt 0901234567, 2 bó hoa hồng đỏ, giao 25/10 lúc 9h' }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'heuristic');
  assert.equal(r.body.data.delivery_date, '2026-10-25');
  assert.equal(r.body.data.delivery_time, '09:00');
  assert.equal(r.body.data.items[0].flower_id, rose.id);
  assert.match(r.body.reply, /Dạ shop xác nhận/);

  // Fake Gemini via a second app instance with a stubbed fetch
  const fakeFetch = async (url, opts) => {
    assert.match(String(url), /generativelanguage/);
    assert.ok(JSON.parse(opts.body).contents[0].parts.some((p) => p.inline_data));
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"customer_name":"Hà","price":500000,"deposit_percent":100,"deposit_status":"full","items":[{"name":"hồng đỏ","qty":2}]}' }] } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const app2 = await makeApp('up2', { geminiKey: 'test-key', fetchImpl: fakeFetch });
  const s2 = await new Promise((res) => {
    const s = app2.listen(0, '127.0.0.1', () => res(s));
  });
  const b2 = `http://127.0.0.1:${s2.address().port}`;
  const setup = await fetch(`${b2}/api/auth/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.vn', password: 'matkhau123' }),
  });
  const c2 = setup.headers.get('set-cookie').split(';')[0];
  r = await fetch(`${b2}/api/ai/parse`, {
    method: 'POST',
    headers: { cookie: c2, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ images: [`data:image/png;base64,${PNG.toString('base64')}`] }] }),
  }).then((x) => x.json());
  s2.close();
  assert.equal(r.source, 'gemini');
  assert.equal(r.data.customer_name, 'Hà');
  assert.equal(r.data.deposit_status, 'full');
  assert.equal(r.data.deposit_amount, 500000);
});

test('owner can add staff login; staff cannot change settings', async () => {
  const r = await api('POST', '/api/users', { email: 'nv@shop.vn', password: 'matkhau123' });
  assert.equal(r.status, 201);
  const ownerCookie = cookie;
  await api('POST', '/api/auth/login', { email: 'nv@shop.vn', password: 'matkhau123' });
  assert.notEqual(cookie, ownerCookie);
  assert.equal((await api('PUT', '/api/settings', { gemini_api_key: 'x' })).status, 403);
  assert.equal((await api('GET', '/api/orders')).status, 200);
  cookie = ownerCookie;
});

test('conflicts: stale status/edit rejected with who did it; staff cannot purge', async () => {
  const ownerCookie = cookie;
  const o = (await api('POST', '/api/orders', { customer_name: 'Xung đột', delivery_date: '2026-11-01', product_summary: 'x', price: 100 })).body;
  assert.equal(o.version, 0);
  await api('POST', '/api/auth/login', { email: 'nv@shop.vn', password: 'matkhau123' });
  const staffCookie = cookie;
  // staff starts making it; owner's stale screen still shows "pending"
  assert.equal((await api('POST', `/api/orders/${o.id}/status`, { status: 'making', from: 'pending' })).status, 200);
  cookie = ownerCookie;
  let r = await api('POST', `/api/orders/${o.id}/status`, { status: 'making', from: 'pending' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /nv@shop\.vn đã chuyển đơn sang "Đang làm"/);
  r = await api('POST', `/api/orders/${o.id}/status`, { status: 'cancelled', from: 'pending' });
  assert.equal(r.status, 409);
  assert.equal((await api('GET', `/api/orders/${o.id}`)).body.events.length, 2);
  // lost update: both load version 0, staff saves first
  cookie = staffCookie;
  assert.equal((await api('PUT', `/api/orders/${o.id}`, { ...o, price: 800, version: 0 })).body.version, 1);
  cookie = ownerCookie;
  r = await api('PUT', `/api/orders/${o.id}`, { ...o, note: 'owner', version: 0 });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /nv@shop\.vn vừa sửa đơn/);
  assert.equal((await api('GET', `/api/orders/${o.id}`)).body.price, 800);
  // staff can trash but not purge
  cookie = staffCookie;
  await api('DELETE', `/api/orders/${o.id}`);
  assert.equal((await api('DELETE', `/api/orders/${o.id}/purge`)).status, 403);
  assert.equal((await api('POST', '/api/trash/empty')).status, 403);
  cookie = ownerCookie;
  await api('POST', `/api/orders/${o.id}/restore`);
});

test('rejects impossible dates/times; huge numbers and ids do not crash', async () => {
  const b = { customer_name: 'Biên', product_summary: 'x' };
  assert.equal((await api('POST', '/api/orders', { ...b, delivery_date: '2026-02-31' })).status, 400);
  const r = await api('POST', '/api/orders', { ...b, delivery_date: '2028-02-29', delivery_time: '25:99', price: 3e9 });
  assert.equal(r.status, 201);
  assert.equal(r.body.delivery_time, '');
  assert.equal(r.body.price, 1e9);
  assert.equal((await api('GET', '/api/orders/99999999999')).status, 404);
});
