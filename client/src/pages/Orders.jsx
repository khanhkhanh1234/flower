import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../icons.jsx';
import { STATUS, fmtDate, weekday } from '../format.js';
import OrderCard from '../components/OrderCard.jsx';
import { Empty, ErrorBox, Loading, SearchInput, useDebounced, useLoad } from '../components/ui.jsx';

export default function Orders() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dq = useDebounced(q);
  const qs = new URLSearchParams(Object.entries({ q: dq, status, from, to }).filter(([, v]) => v)).toString();
  const orders = useLoad(() => api(`/orders?${qs}`), [qs]);

  const groups = [];
  for (const o of orders.data || []) {
    const last = groups[groups.length - 1];
    if (last && last.date === o.delivery_date) last.items.push(o);
    else groups.push({ date: o.delivery_date, items: [o] });
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Đơn hàng</h1>
        <Link to="/orders/new" className="btn btn-primary btn-sm">
          <Icon name="plus" size={16} /> Tạo đơn
        </Link>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Tìm tên, SĐT, mô tả hoa, mã đơn…" />
      <div className="row gap wrap filters">
        <label className="inline-field">
          Từ <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="inline-field">
          Đến <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(from || to) && (
          <button type="button" className="link" onClick={() => (setFrom(''), setTo(''))}>
            Bỏ lọc ngày
          </button>
        )}
      </div>
      <div className="chips">
        <button type="button" className={`chip ${!status ? 'active' : ''}`} onClick={() => setStatus('')}>
          Tất cả
        </button>
        {Object.entries(STATUS).map(([k, v]) => (
          <button type="button" key={k} className={`chip chip-${k} ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>
            {v.label}
          </button>
        ))}
      </div>
      <ErrorBox error={orders.error} onRetry={orders.reload} />
      {orders.loading && !orders.data ? (
        <Loading />
      ) : groups.length ? (
        groups.map((g) => (
          <section key={g.date} className="group">
            <h2 className="group-title">
              {g.date ? `${weekday(g.date)}, ${fmtDate(g.date)}` : 'Chưa có ngày giao'} <span>{g.items.length} đơn</span>
            </h2>
            <div className="order-list">
              {g.items.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <Empty icon="orders" title="Không có đơn nào">
          <Link to="/orders/new" className="btn btn-primary">
            <Icon name="plus" size={18} /> Tạo đơn
          </Link>
        </Empty>
      )}
    </div>
  );
}
