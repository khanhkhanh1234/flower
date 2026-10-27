import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { slugify, transaction } from '../db.js';
import { checkPassword, requireAdmin, signAdminToken } from '../auth.js';
import { HttpError, parse } from '../http.js';
import { idParam, loginInput, orderStatusInput, productInput } from '../schemas.js';
import { PRODUCT_SELECT } from './public.js';

export function adminRoutes(db, { jwtSecret, adminPassword }) {
  const router = Router();

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

  router.post('/auth/login', loginLimiter, (req, res) => {
    const { password } = parse(loginInput, req.body);
    if (!checkPassword(password, adminPassword)) throw new HttpError(401, 'Sai mật khẩu');
    res.json({ token: signAdminToken(jwtSecret) });
  });

  router.use('/admin', requireAdmin(jwtSecret));

  function uniqueSlug(name, excludeId = 0) {
    const base = slugify(name) || 'san-pham';
    const exists = db.prepare('SELECT 1 FROM products WHERE slug = ? AND id != ?');
    let slug = base;
    for (let i = 2; exists.get(slug, excludeId); i++) slug = `${base}-${i}`;
    return slug;
  }

  function assertCategory(categoryId) {
    if (categoryId && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) {
      throw new HttpError(400, 'Danh mục không tồn tại');
    }
  }

  function getProduct(id) {
    const product = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id);
    if (!product) throw new HttpError(404, 'Không tìm thấy sản phẩm');
    return product;
  }

  router.get('/admin/products', (_req, res) => {
    res.json(db.prepare(`${PRODUCT_SELECT} ORDER BY p.id DESC`).all());
  });

  router.post('/admin/products', (req, res) => {
    const data = parse(productInput, req.body);
    assertCategory(data.category_id);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO products (name, slug, description, price, image_url, category_id, stock, is_active)
         VALUES (:name, :slug, :description, :price, :image_url, :category_id, :stock, :is_active)`
      )
      .run({ ...data, slug: uniqueSlug(data.name), is_active: data.is_active ? 1 : 0 });
    res.status(201).json(getProduct(Number(lastInsertRowid)));
  });

  router.put('/admin/products/:id', (req, res) => {
    const { id } = parse(idParam, req.params);
    getProduct(id);
    const data = parse(productInput, req.body);
    assertCategory(data.category_id);
    db.prepare(
      `UPDATE products SET name = :name, slug = :slug, description = :description, price = :price,
         image_url = :image_url, category_id = :category_id, stock = :stock, is_active = :is_active
       WHERE id = :id`
    ).run({ ...data, id, slug: uniqueSlug(data.name, id), is_active: data.is_active ? 1 : 0 });
    res.json(getProduct(id));
  });

  router.delete('/admin/products/:id', (req, res) => {
    const { id } = parse(idParam, req.params);
    const { changes } = db.prepare('DELETE FROM products WHERE id = ?').run(id);
    if (!changes) throw new HttpError(404, 'Không tìm thấy sản phẩm');
    res.status(204).end();
  });

  router.get('/admin/orders', (_req, res) => {
    const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    const items = db.prepare('SELECT * FROM order_items ORDER BY id').all();
    const byOrder = Map.groupBy(items, (i) => i.order_id);
    res.json(orders.map((o) => ({ ...o, items: byOrder.get(o.id) || [] })));
  });

  router.patch('/admin/orders/:id', (req, res) => {
    const { id } = parse(idParam, req.params);
    const { status } = parse(orderStatusInput, req.body);

    const updated = transaction(db, () => {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      if (!order) throw new HttpError(404, 'Không tìm thấy đơn hàng');
      if (order.status === 'cancelled' && status !== 'cancelled') {
        throw new HttpError(400, 'Không thể mở lại đơn đã huỷ');
      }
      if (status === 'cancelled' && order.status !== 'cancelled') {
        // Return items to stock
        db.prepare(
          `UPDATE products SET stock = stock + (
             SELECT SUM(quantity) FROM order_items WHERE order_id = :id AND product_id = products.id)
           WHERE id IN (SELECT product_id FROM order_items WHERE order_id = :id)`
        ).run({ id });
      }
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
      return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    });

    res.json(updated);
  });

  return router;
}
