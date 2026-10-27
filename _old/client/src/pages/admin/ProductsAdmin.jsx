import { useEffect, useState } from 'react';
import { api, formatPrice } from '../../api.js';
import ProductImage from '../../components/ProductImage.jsx';

const EMPTY = { name: '', description: '', price: '', image_url: '', category_id: '', stock: '', is_active: true };

export default function ProductsAdmin({ adminApi }) {
  const [products, setProducts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | product
  const [error, setError] = useState('');

  const load = () =>
    adminApi('/admin/products')
      .then(setProducts)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api('/categories').then(setCategories).catch(() => {});
  }, []);

  const remove = async (p) => {
    if (!confirm(`Xoá "${p.name}"?`)) return;
    try {
      await adminApi(`/admin/products/${p.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (editing) {
    return (
      <ProductForm
        product={editing === 'new' ? null : editing}
        categories={categories}
        adminApi={adminApi}
        onDone={() => {
          setEditing(null);
          load();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <>
      <div className="row-between">
        <span className="muted">{products ? `${products.length} sản phẩm` : ''}</span>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          + Thêm sản phẩm
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!products ? (
        <p className="muted">Đang tải...</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Tên</th>
                <th>Danh mục</th>
                <th>Giá</th>
                <th>Kho</th>
                <th>Hiển thị</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <ProductImage product={p} className="thumb small-thumb" />
                  </td>
                  <td>{p.name}</td>
                  <td>{p.category_name || '—'}</td>
                  <td>{formatPrice(p.price)}</td>
                  <td>{p.stock}</td>
                  <td>{p.is_active ? '✓' : '✗'}</td>
                  <td className="actions">
                    <button className="link" onClick={() => setEditing(p)}>
                      Sửa
                    </button>
                    <button className="link danger" onClick={() => remove(p)}>
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ProductForm({ product, categories, adminApi, onDone, onCancel }) {
  const [form, setForm] = useState(() =>
    product
      ? {
          ...EMPTY,
          ...product,
          image_url: product.image_url || '',
          category_id: product.category_id ?? '',
          is_active: !!product.is_active,
        }
      : EMPTY
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      image_url: form.image_url.trim() || null,
      category_id: form.category_id ? Number(form.category_id) : null,
      stock: Number(form.stock || 0),
      is_active: form.is_active,
    };
    try {
      await adminApi(product ? `/admin/products/${product.id}` : '/admin/products', {
        method: product ? 'PUT' : 'POST',
        body,
      });
      onDone();
    } catch (err) {
      setSaving(false);
      setError(err.details ? err.details.map((d) => `${d.path}: ${d.message}`).join('; ') : err.message);
    }
  };

  return (
    <form className="form product-form" onSubmit={submit}>
      <h2>{product ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
      <label className="field">
        <span>Tên</span>
        <input value={form.name} onChange={set('name')} required maxLength={150} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Giá (VNĐ)</span>
          <input type="number" min="0" step="1000" value={form.price} onChange={set('price')} required />
        </label>
        <label className="field">
          <span>Tồn kho</span>
          <input type="number" min="0" value={form.stock} onChange={set('stock')} />
        </label>
        <label className="field">
          <span>Danh mục</span>
          <select value={form.category_id} onChange={set('category_id')}>
            <option value="">— Không —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Link ảnh (https://...)</span>
        <input value={form.image_url} onChange={set('image_url')} placeholder="https://..." />
      </label>
      <label className="field">
        <span>Mô tả</span>
        <textarea value={form.description} onChange={set('description')} rows={4} maxLength={2000} />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> Hiển thị trên cửa hàng
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </form>
  );
}
