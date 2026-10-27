import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../icons.jsx';
import { STATUS, addDays, fmtDate, isoDate, vnd, weekday } from '../format.js';
import OrderCard from '../components/OrderCard.jsx';
import { Empty, ErrorBox, Loading, Modal, useLoad, useToast } from '../components/ui.jsx';

export default function Today() {
  const [params, setParams] = useSearchParams();
  const today = isoDate();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : today;
  const [status, setStatus] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);

  const setDate = (d) => setParams(d === today ? {} : { date: d }, { replace: true });
  const orders = useLoad(() => api(`/orders?date=${date}`), [date]);
  const stats = useLoad(() => api(`/stats/day?date=${date}`), [date]);

  const list = (orders.data || []).filter((o) => !status || o.status === status);
  const isToday = date === today;

  return (
    <div className="page">
      <div className="date-bar">
        <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Ngày trước">
          <Icon name="left" />
        </button>
        <label className="date-pick">
          <span>
            {weekday(date)}, {fmtDate(date)}
          </span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Chọn ngày" />
        </label>
        <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Ngày sau">
          <Icon name="right" />
        </button>
        <button type="button" className={`chip ${isToday ? 'active' : ''}`} onClick={() => setDate(today)}>
          Hôm nay
        </button>
        <button type="button" className="btn btn-soft btn-sm ml-auto" onClick={() => setNoteOpen(true)}>
          <Icon name="note" size={16} /> Ghi chú nhập hàng
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span>Tổng đơn</span>
          <b>{stats.data?.count ?? '—'}</b>
        </div>
        <div className="stat stat-pink">
          <span>Doanh thu</span>
          <b>{stats.data ? vnd(stats.data.revenue) : '—'}</b>
          <small>Không gồm ship, trừ đơn hủy</small>
        </div>
      </div>

      <div className="chips" role="tablist">
        <button type="button" className={`chip ${!status ? 'active' : ''}`} onClick={() => setStatus('')}>
          Tất cả <em>{stats.data?.count ?? 0}</em>
        </button>
        {Object.entries(STATUS).map(([k, v]) => (
          <button type="button" key={k} className={`chip chip-${k} ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>
            {v.label} <em>{stats.data?.by_status[k] ?? 0}</em>
          </button>
        ))}
      </div>

      <ErrorBox error={orders.error} onRetry={orders.reload} />
      {orders.loading && !orders.data ? (
        <Loading />
      ) : list.length ? (
        <div className="order-list">
          {list.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      ) : (
        <Empty icon="flower" title={status ? `Không có đơn "${STATUS[status].label}"` : isToday ? 'Chưa có đơn hôm nay' : `Chưa có đơn ngày ${fmtDate(date)}`}>
          <Link to={`/orders/new?date=${date}`} className="btn btn-primary">
            <Icon name="plus" size={18} /> Thêm đơn
          </Link>
        </Empty>
      )}

      <Link to={`/orders/new?date=${date}`} className="fab" aria-label="Thêm đơn">
        <Icon name="plus" size={26} />
      </Link>
      {noteOpen && <ImportNote date={date} onClose={() => setNoteOpen(false)} />}
    </div>
  );
}

function ImportNote({ date, onClose }) {
  const toast = useToast();
  const note = useLoad(() => api(`/import-notes/${date}`), [date]);
  const [text, setText] = useState(null);
  const value = text ?? note.data?.content ?? '';
  const save = async () => {
    try {
      await api(`/import-notes/${date}`, { method: 'PUT', body: { content: value } });
      toast('Đã lưu ghi chú nhập hàng');
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <Modal
      title={`Ghi chú nhập hàng · ${fmtDate(date)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={note.loading}>
            Lưu
          </button>
        </>
      }
    >
      {note.loading ? (
        <Loading />
      ) : (
        <textarea
          rows={10}
          autoFocus
          value={value}
          onChange={(e) => setText(e.target.value)}
          placeholder={'VD:\n- 100 cành hồng đỏ\n- 30 cành lan trắng\n- Giấy gói hồng pastel'}
        />
      )}
    </Modal>
  );
}
