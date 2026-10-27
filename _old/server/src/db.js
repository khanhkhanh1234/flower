import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price >= 0),
  image_url TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`;

const SEED_CATEGORIES = [
  { name: 'Hoa sinh nhật', slug: 'hoa-sinh-nhat' },
  { name: 'Hoa tình yêu', slug: 'hoa-tinh-yeu' },
  { name: 'Hoa khai trương', slug: 'hoa-khai-truong' },
  { name: 'Hoa cưới', slug: 'hoa-cuoi' },
];

const SEED_PRODUCTS = [
  ['Bó hồng đỏ 20 bông', 'hoa-tinh-yeu', 450000, 'Bó hoa hồng đỏ Đà Lạt tươi, gói giấy kraft sang trọng.'],
  ['Bó hồng phấn ngọt ngào', 'hoa-tinh-yeu', 390000, 'Hoa hồng phấn kết hợp baby trắng, phù hợp tặng người thương.'],
  ['Giỏ hoa hướng dương', 'hoa-sinh-nhat', 520000, 'Giỏ hoa hướng dương rực rỡ mang lại năng lượng tích cực.'],
  ['Bó cúc tana xinh xắn', 'hoa-sinh-nhat', 250000, 'Bó cúc tana nhỏ gọn, tươi tắn, giá hợp lý.'],
  ['Kệ hoa khai trương hồng phát', 'hoa-khai-truong', 1200000, 'Kệ hoa 2 tầng chúc mừng khai trương, hồng phát.'],
  ['Lẵng hoa lan hồ điệp', 'hoa-khai-truong', 1800000, 'Lẵng lan hồ điệp sang trọng, bền đẹp.'],
  ['Hoa cầm tay cô dâu trắng', 'hoa-cuoi', 650000, 'Hoa cưới cầm tay tông trắng tinh khôi.'],
  ['Bó tulip Hà Lan', 'hoa-sinh-nhat', 890000, 'Tulip nhập khẩu Hà Lan, nhiều màu sắc.'],
];

export function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function seed(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM categories').get();
  if (count > 0) return;

  transaction(db, () => {
    const insertCat = db.prepare('INSERT INTO categories (name, slug) VALUES (:name, :slug)');
    const catIds = {};
    for (const c of SEED_CATEGORIES) {
      catIds[c.slug] = Number(insertCat.run(c).lastInsertRowid);
    }
    const insertProduct = db.prepare(
      `INSERT INTO products (name, slug, description, price, category_id, stock)
       VALUES (:name, :slug, :description, :price, :category_id, :stock)`
    );
    for (const [name, catSlug, price, description] of SEED_PRODUCTS) {
      insertProduct.run({
        name,
        slug: slugify(name),
        description,
        price,
        category_id: catIds[catSlug],
        stock: 20,
      });
    }
  });
}

export function openDb(path = ':memory:', { seedData = true } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  if (seedData) seed(db);
  return db;
}
