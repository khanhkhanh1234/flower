import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';

export default function Home() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const q = params.get('q') || '';

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(q);

  useEffect(() => {
    api('/categories').then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (category) qs.set('category', category);
    if (q) qs.set('q', q);
    setProducts(null);
    setError('');
    api(`/products?${qs}`)
      .then(setProducts)
      .catch((e) => setError(e.message));
  }, [category, q]);

  const update = (next) => {
    const merged = { category, q, ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, v]) => v)));
  };

  return (
    <>
      <section className="hero">
        <h1>Hoa tươi mỗi ngày</h1>
        <p>Giao hoa nhanh trong ngày · Thanh toán khi nhận hàng</p>
      </section>

      <div className="toolbar">
        <div className="chips">
          <button className={`chip ${!category ? 'active' : ''}`} onClick={() => update({ category: '' })}>
            Tất cả
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`chip ${category === c.slug ? 'active' : ''}`}
              onClick={() => update({ category: c.slug })}
            >
              {c.name}
            </button>
          ))}
        </div>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim() });
          }}
        >
          <input
            type="search"
            placeholder="Tìm hoa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm kiếm"
          />
          <button className="btn">Tìm</button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}
      {!products && !error && <p className="muted">Đang tải...</p>}
      {products && products.length === 0 && <p className="muted">Không có sản phẩm nào.</p>}
      {products && products.length > 0 && (
        <div className="grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </>
  );
}
