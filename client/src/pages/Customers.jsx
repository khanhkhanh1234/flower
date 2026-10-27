import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../icons.jsx';
import { fmtDate } from '../format.js';
import { Empty, ErrorBox, Field, Loading, Modal, SearchInput, useDebounced, useLoad, useToast } from '../components/ui.jsx';

export function CustomerModal({ customer, onClose, onSaved }) {
  const [c, setC] = useState({ name: '', phone: '', address: '', note: '', ...customer });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = c.id ? await api(`/customers/${c.id}`, { method: 'PUT', body: c }) : await api('/customers', { method: 'POST', body: c });
      toast(c.id ? 'Đã lưu khách hàng' : 'Đã thêm khách hàng');
      onSaved(saved);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={c.id ? 'Sửa khách hàng' : 'Thêm khách hàng'} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <Field label="Tên khách" required>
          <input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} required autoFocus />
        </Field>
        <Field label="Số điện thoại">
          <input type="tel" value={c.phone || ''} onChange={(e) => setC({ ...c, phone: e.target.value })} />
        </Field>
        <Field label="Địa chỉ">
          <input value={c.address || ''} onChange={(e) => setC({ ...c, address: e.target.value })} />
        </Field>
        <Field label="Ghi chú">
          <textarea rows={3} value={c.note || ''} onChange={(e) => setC({ ...c, note: e.target.value })} />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          Lưu
        </button>
      </form>
    </Modal>
  );
}

export default function Customers() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const list = useLoad(() => api(`/customers?q=${encodeURIComponent(dq)}`), [dq]);
  const [adding, setAdding] = useState(false);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Khách hàng</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> Thêm khách
        </button>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Tìm tên hoặc SĐT…" />
      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data?.length ? (
        <ul className="list">
          {list.data.map((c) => (
            <li key={c.id}>
              <Link to={`/customers/${c.id}`} className="list-item">
                <span className="avatar">{c.name.trim().charAt(0).toUpperCase()}</span>
                <span className="grow">
                  <b>{c.name}</b>
                  <span className="muted small">{c.phone || 'Không có SĐT'}</span>
                </span>
                <span className="right small">
                  <b>{c.order_count} đơn</b>
                  {c.last_order && <span className="muted">Gần nhất {fmtDate(c.last_order)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="users" title={q ? 'Không tìm thấy khách' : 'Chưa có khách hàng'}>
          <p className="muted small">Khách sẽ tự được thêm khi bạn tạo đơn.</p>
        </Empty>
      )}
      {adding && (
        <CustomerModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
          }}
        />
      )}
    </div>
  );
}
