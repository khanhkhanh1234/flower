import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { transaction } from '../db.js';
import { HttpError, parse } from '../http.js';
import { orderInput, productQuery } from '../schemas.js';

export const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.slug, p.description, p.price, p.image_url, p.stock, p.is_active,
         p.category_id, c.name AS category_name, c.slug AS category_slug, p.created_at
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

export function publicRoutes(db) {
  const router = Router();

  const orderLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

  router.get('/categories', (_req, res) => {
    res.json(db.prepare('SELECT id, name, slug FROM categories ORDER BY id').all());
  });

  router.get('/products', (req, res) => {
    const { category, q } = parse(productQuery, req.query);
    const where = ['p.is_active = 1'];
    const params = {};
    if (category) {
      where.push('c.slug = :category');
      params.category = category;
    }
    if (q) {
      where.push("p.name LIKE :q ESCAPE '\\'");
      params.q = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    }
    const sql = `${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.id DESC`;
    res.json(db.prepare(sql).all(params));
  });

  router.get('/products/:slug', (req, res) => {
    const product = db.prepare(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.is_active = 1`).get(req.params.slug);
    if (!product) throw new HttpError(404, 'Không tìm thấy sản phẩm');
    res.json(product);
  });

  router.post('/orders', orderLimiter, (req, res) => {
    const { customer, items } = parse(orderInput, req.body);

    const quantities = new Map();
    for (const { productId, quantity } of items) {
      quantities.set(productId, (quantities.get(productId) || 0) + quantity);
    }

    const order = transaction(db, () => {
      const getProduct = db.prepare('SELECT id, name, price, stock FROM products WHERE id = ? AND is_active = 1');
      const decrement = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      const lines = [];
      let total = 0;

      for (const [productId, quantity] of quantities) {
        const product = getProduct.get(productId);
        if (!product) throw new HttpError(400, `Sản phẩm #${productId} không tồn tại`);
        if (product.stock < quantity) {
          throw new HttpError(409, `"${product.name}" chỉ còn ${product.stock} sản phẩm`);
        }
        decrement.run(quantity, productId);
        total += product.price * quantity;
        lines.push({ product, quantity });
      }

      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO orders (customer_name, phone, address, note, total)
           VALUES (:name, :phone, :address, :note, :total)`
        )
        .run({ ...customer, total });
      const orderId = Number(lastInsertRowid);

      const insertItem = db.prepare(
        'INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)'
      );
      for (const { product, quantity } of lines) {
        insertItem.run(orderId, product.id, product.name, product.price, quantity);
      }
      return { id: orderId, total, status: 'pending' };
    });

    res.status(201).json(order);
  });

  return router;
}
