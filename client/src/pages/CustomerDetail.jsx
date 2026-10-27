import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../icons.jsx';
import { vnd } from '../format.js';
import OrderCard from '../components/OrderCard.jsx';
import { Empty, ErrorBox, Loading, confirmAsk, useLoad, useToast } from '../components/ui.jsx';
import { CustomerModal } from './Customers.jsx';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const c = useLoad(() => api(`/customers/${id}`), [id]);
  const [editing, setEditing] = useState(false);

  if (c.error && !c.data) return <div className="page"><ErrorBox error={c.error} onRetry={c.reload} /></div>;
  if (!c.data) return <Loading />;
  const d = c.data;

  const remove = async () => {
    if (!confirmAsk(`Xóa khách "${d.name}"? Các đơn cũ vẫn được giữ.`)) return;
    await api(`/customers/${d.id}`, { method: 'DELETE' });
    toast('Đã xóa khách hàng');
    navigate('/customers', { replace: true });
  };

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Quay lại">
          <Icon name="left" />
        </button>
        <h1>{d.name}</h1>
        <button type="button" className="btn btn-soft btn-sm ml-auto" onClick={() => setEditing(true)}>
          <Icon name="edit" size={16} /> Sửa
        </button>
      </div>
      <section className="card stack">
        <dl className="kv">
          <dt>SĐT</dt>
          <dd>{d.phone ? <a href={`tel:${d.phone}`}>{d.phone}</a> : '—'}</dd>
          <dt>Địa chỉ</dt>
          <dd>{d.address || '—'}</dd>
          {d.note && (
            <>
              <dt>Ghi chú</dt>
              <dd className="pre">{d.note}</dd>
            </>
          )}
        </dl>
        <div className="stat-grid">
          <div className="stat">
            <span>Số đơn</span>
            <b>{d.orders.length}</b>
          </div>
          <div className="stat stat-pink">
            <span>Tổng chi tiêu</span>
            <b>{vnd(d.spent)}</b>
          </div>
        </div>
        <div className="row gap wrap">
          <Link to={`/orders/new?customer=${d.id}`} className="btn btn-primary">
            <Icon name="plus" size={16} /> Tạo đơn cho khách
          </Link>
          <button type="button" className="btn btn-danger-ghost" onClick={remove}>
            Xóa khách
          </button>
        </div>
      </section>
      <h2 className="group-title">Lịch sử đơn</h2>
      {d.orders.length ? (
        <div className="order-list">
          {d.orders.map((o) => (
            <OrderCard key={o.id} order={o} showDate />
          ))}
        </div>
      ) : (
        <Empty icon="orders" title="Khách chưa có đơn nào" />
      )}
      {editing && (
        <CustomerModal
          customer={d}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            c.reload();
          }}
        />
      )}
    </div>
  );
}
