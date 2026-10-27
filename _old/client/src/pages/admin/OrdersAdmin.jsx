import { useEffect, useState } from 'react';
import { formatPrice } from '../../api.js';

const STATUS_LABELS = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã huỷ',
};

export default function OrdersAdmin({ adminApi }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    adminApi('/admin/orders')
      .then(setOrders)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (order, status) => {
    if (status === 'cancelled' && !confirm(`Huỷ đơn #${order.id}? Số lượng sẽ được hoàn lại kho.`)) return;
    try {
      setError('');
      await adminApi(`/admin/orders/${order.id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!orders) return error ? <p className="error">{error}</p> : <p className="muted">Đang tải...</p>;
  if (orders.length === 0) return <p className="muted">Chưa có đơn hàng nào.</p>;

  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="orders">
        {orders.map((o) => (
          <div key={o.id} className={`order status-${o.status}`}>
            <div className="order-head">
              <strong>#{o.id}</strong>
              <span className="muted small">{new Date(o.created_at + 'Z').toLocaleString('vi-VN')}</span>
              <select
                value={o.status}
                onChange={(e) => updateStatus(o, e.target.value)}
                disabled={o.status === 'cancelled'}
                aria-label="Trạng thái"
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="order-body">
              <div>
                <div>
                  <strong>{o.customer_name}</strong> · <a href={`tel:${o.phone}`}>{o.phone}</a>
                </div>
                <div className="muted">{o.address}</div>
                {o.note && <div className="note">“{o.note}”</div>}
              </div>
              <ul className="order-items">
                {o.items.map((i) => (
                  <li key={i.id}>
                    {i.product_name} × {i.quantity} — {formatPrice(i.price * i.quantity)}
                  </li>
                ))}
                <li>
                  <strong>Tổng: {formatPrice(o.total)}</strong>
                </li>
              </ul>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
