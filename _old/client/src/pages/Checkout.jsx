import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, formatPrice } from '../api.js';
import { useCart } from '../cart.jsx';

export default function Checkout() {
  const { items, total, clear } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', phone: '', address: '', note: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (items.length === 0 && !submitting) return <Navigate to="/gio-hang" replace />;

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setErrors({});
    try {
      const order = await api('/orders', {
        method: 'POST',
        body: {
          customer: form,
          items: items.map((i) => ({ productId: i.id, quantity: i.quantity })),
        },
      });
      clear();
      navigate(`/dat-hang-thanh-cong/${order.id}`, { replace: true, state: { total: order.total } });
    } catch (err) {
      setSubmitting(false);
      setError(err.message);
      if (err.details) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.path.replace('customer.', ''), d.message])));
      }
    }
  };

  return (
    <>
      <h1>Thông tin giao hàng</h1>
      <div className="checkout">
        <form className="form" onSubmit={submit} noValidate>
          <Field label="Họ tên" error={errors.name}>
            <input value={form.name} onChange={set('name')} required autoComplete="name" />
          </Field>
          <Field label="Số điện thoại" error={errors.phone}>
            <input value={form.phone} onChange={set('phone')} required inputMode="tel" autoComplete="tel" />
          </Field>
          <Field label="Địa chỉ nhận hoa" error={errors.address}>
            <textarea value={form.address} onChange={set('address')} required rows={2} autoComplete="street-address" />
          </Field>
          <Field label="Ghi chú (lời chúc, giờ giao...)" error={errors.note}>
            <textarea value={form.note} onChange={set('note')} rows={3} />
          </Field>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Đang gửi...' : 'Đặt hàng (thanh toán khi nhận)'}
          </button>
        </form>

        <aside className="summary">
          <h2>Đơn hàng</h2>
          {items.map((i) => (
            <div key={i.id} className="summary-row">
              <span>
                {i.name} × {i.quantity}
              </span>
              <span>{formatPrice(i.price * i.quantity)}</span>
            </div>
          ))}
          <div className="summary-row total">
            <span>Tổng</span>
            <span>{formatPrice(total)}</span>
          </div>
          <Link to="/gio-hang" className="small">
            ← Sửa giỏ hàng
          </Link>
        </aside>
      </div>
    </>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="error">{error}</small>}
    </label>
  );
}
