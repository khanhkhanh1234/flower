import { api } from '../api.js';
import Icon from '../icons.jsx';
import { fmtDate, fmtDateTime, vnd } from '../format.js';
import { Empty, ErrorBox, Loading, confirmAsk, useLoad, useToast } from '../components/ui.jsx';

export default function Trash() {
  const list = useLoad(() => api('/orders?trash=1'), []);
  const toast = useToast();

  const restore = async (o) => {
    await api(`/orders/${o.id}/restore`, { method: 'POST' });
    toast(`Đã khôi phục ${o.is_draft ? 'đơn nháp' : `đơn #${o.id}`}`);
    list.reload();
  };
  const purge = async (o) => {
    if (!confirmAsk(`Xóa vĩnh viễn đơn #${o.id}? Không thể hoàn tác.`)) return;
    await api(`/orders/${o.id}/purge`, { method: 'DELETE' });
    toast('Đã xóa vĩnh viễn');
    list.reload();
  };
  const empty = async () => {
    if (!confirmAsk('Dọn sạch thùng rác? Tất cả đơn trong Rác sẽ bị xóa vĩnh viễn.')) return;
    await api('/trash/empty', { method: 'POST' });
    toast('Đã dọn sạch thùng rác');
    list.reload();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Rác</h1>
        {list.data?.length > 0 && (
          <button type="button" className="btn btn-danger-ghost btn-sm ml-auto" onClick={empty}>
            Dọn sạch
          </button>
        )}
      </div>
      <p className="hint">Đơn đã xóa nằm ở đây cho tới khi bạn xóa vĩnh viễn.</p>
      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data?.length ? (
        <ul className="list">
          {list.data.map((o) => (
            <li key={o.id} className="list-item">
              <span className="grow">
                <b>
                  #{o.id} · {o.customer_name || 'Chưa có tên'} {o.is_draft && <span className="pill">Nháp</span>}
                </b>
                <span className="muted small">
                  {o.product_summary || '—'} · Giao {fmtDate(o.delivery_date)} · {vnd(o.totals.total)}
                </span>
                <span className="muted small">Xóa lúc {fmtDateTime(o.deleted_at)}</span>
              </span>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => restore(o)}>
                <Icon name="restore" size={16} /> Khôi phục
              </button>
              <button type="button" className="icon-btn" onClick={() => purge(o)} aria-label="Xóa vĩnh viễn">
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="trash" title="Thùng rác trống" />
      )}
    </div>
  );
}
