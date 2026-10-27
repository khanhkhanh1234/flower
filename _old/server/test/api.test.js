import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

const jwtSecret = 'test-secret-that-is-long-enough-1234567890';
const adminPassword = 'admin-password';

let app;
let db;

beforeEach(() => {
  db = openDb(':memory:');
  app = createApp({ db, jwtSecret, adminPassword });
});

async function login() {
  const res = await request(app).post('/api/auth/login').send({ password: adminPassword });
  assert.equal(res.status, 200);
  return `Bearer ${res.body.token}`;
}

describe('public API', () => {
  test('health', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
  });

  test('lists categories and products', async () => {
    const cats = await request(app).get('/api/categories');
    assert.equal(cats.status, 200);
    assert.ok(cats.body.length >= 4);

    const products = await request(app).get('/api/products');
    assert.equal(products.status, 200);
    assert.ok(products.body.length >= 8);
  });

  test('filters products by category and search', async () => {
    const byCat = await request(app).get('/api/products?category=hoa-cuoi');
    assert.ok(byCat.body.length > 0);
    assert.ok(byCat.body.every((p) => p.category_slug === 'hoa-cuoi'));

    const bySearch = await request(app).get('/api/products?q=tulip');
    assert.equal(bySearch.body.length, 1);

    const wildcard = await request(app).get('/api/products?q=%25');
    assert.equal(wildcard.body.length, 0);
  });

  test('gets product by slug, 404 when missing', async () => {
    const ok = await request(app).get('/api/products/bo-tulip-ha-lan');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.name, 'Bó tulip Hà Lan');

    const missing = await request(app).get('/api/products/khong-co');
    assert.equal(missing.status, 404);
  });

  test('unknown api route returns 404 json', async () => {
    const res = await request(app).get('/api/nope');
    assert.equal(res.status, 404);
  });
});

describe('orders', () => {
  const customer = { name: 'Nguyễn Văn A', phone: '0901234567', address: '123 Lê Lợi, Q1, HCM' };

  test('creates order with server-side total and decrements stock', async () => {
    const product = db.prepare('SELECT * FROM products LIMIT 1').get();
    const res = await request(app)
      .post('/api/orders')
      .send({ customer, items: [{ productId: product.id, quantity: 2, price: 1 }] });
    assert.equal(res.status, 201);
    assert.equal(res.body.total, product.price * 2);

    const after = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id);
    assert.equal(after.stock, product.stock - 2);
  });

  test('merges duplicate items', async () => {
    const product = db.prepare('SELECT * FROM products LIMIT 1').get();
    const res = await request(app)
      .post('/api/orders')
      .send({ customer, items: [{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 2 }] });
    assert.equal(res.status, 201);
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(res.body.id);
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, 3);
  });

  test('rejects when out of stock and rolls back', async () => {
    const [a, b] = db.prepare('SELECT * FROM products LIMIT 2').all();
    db.prepare('UPDATE products SET stock = 1 WHERE id = ?').run(b.id);
    const res = await request(app)
      .post('/api/orders')
      .send({ customer, items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 5 }] });
    assert.equal(res.status, 409);
    assert.equal(db.prepare('SELECT stock FROM products WHERE id = ?').get(a.id).stock, a.stock);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0);
  });

  test('validates input', async () => {
    const bad = await request(app).post('/api/orders').send({ customer: { ...customer, phone: 'abc' }, items: [] });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.details.length >= 2);

    const missing = await request(app).post('/api/orders').send({ customer, items: [{ productId: 99999, quantity: 1 }] });
    assert.equal(missing.status, 400);

    const badJson = await request(app).post('/api/orders').set('content-type', 'application/json').send('{bad');
    assert.equal(badJson.status, 400);
  });
});

describe('admin', () => {
  test('rejects wrong password and missing token', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'wrong' });
    assert.equal(res.status, 401);

    assert.equal((await request(app).get('/api/admin/products')).status, 401);
    assert.equal(
      (await request(app).get('/api/admin/products').set('authorization', 'Bearer garbage')).status,
      401
    );
  });

  test('product CRUD', async () => {
    const auth = await login();
    const created = await request(app)
      .post('/api/admin/products')
      .set('authorization', auth)
      .send({ name: 'Bó Hồng Test', price: 100000, stock: 5, category_id: 1 });
    assert.equal(created.status, 201);
    assert.equal(created.body.slug, 'bo-hong-test');

    const dup = await request(app)
      .post('/api/admin/products')
      .set('authorization', auth)
      .send({ name: 'Bó Hồng Test', price: 1 });
    assert.equal(dup.body.slug, 'bo-hong-test-2');

    const updated = await request(app)
      .put(`/api/admin/products/${created.body.id}`)
      .set('authorization', auth)
      .send({ name: 'Bó Hồng Test', price: 120000, stock: 3, is_active: false });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.price, 120000);
    assert.equal(updated.body.slug, 'bo-hong-test');

    // inactive product hidden from public
    assert.equal((await request(app).get('/api/products/bo-hong-test')).status, 404);

    const badUrl = await request(app)
      .put(`/api/admin/products/${created.body.id}`)
      .set('authorization', auth)
      .send({ name: 'X', price: 1, image_url: 'javascript:alert(1)' });
    assert.equal(badUrl.status, 400);

    const del = await request(app).delete(`/api/admin/products/${created.body.id}`).set('authorization', auth);
    assert.equal(del.status, 204);
  });

  test('order status update and cancel restores stock', async () => {
    const auth = await login();
    const product = db.prepare('SELECT * FROM products LIMIT 1').get();
    const order = await request(app)
      .post('/api/orders')
      .send({
        customer: { name: 'B', phone: '0912345678', address: 'Hà Nội, Việt Nam' },
        items: [{ productId: product.id, quantity: 3 }],
      });

    const list = await request(app).get('/api/admin/orders').set('authorization', auth);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].items.length, 1);

    const confirm = await request(app)
      .patch(`/api/admin/orders/${order.body.id}`)
      .set('authorization', auth)
      .send({ status: 'confirmed' });
    assert.equal(confirm.body.status, 'confirmed');

    await request(app).patch(`/api/admin/orders/${order.body.id}`).set('authorization', auth).send({ status: 'cancelled' });
    assert.equal(db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock, product.stock);

    const reopen = await request(app)
      .patch(`/api/admin/orders/${order.body.id}`)
      .set('authorization', auth)
      .send({ status: 'pending' });
    assert.equal(reopen.status, 400);
  });
});
