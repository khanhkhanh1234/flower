import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../icons.jsx';
import { fmtDateTime } from '../format.js';
import OrderCard from '../components/OrderCard.jsx';
import { Empty, ErrorBox, Loading, confirmAsk, useLoad, useToast } from '../components/ui.jsx';

export default function Drafts() {
  const drafts = useLoad(() => api('/orders?draft=1'), []);
  const toast = useToast();

  const remove = async (o) => {
    if (!confirmAsk('Xóa đơn nháp này?')) return;
    await api(`/orders/${o.id}`, { method: 'DELETE' });
    toast('Đã chuyển đơn nháp vào Rác');
    drafts.reload();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Đơn nháp</h1>
        <Link to="/orders/new" className="btn btn-primary btn-sm">
          <Icon name="plus" size={16} /> Tạo đơn
        </Link>
      </div>
      <p className="hint">Đơn chưa đủ thông tin được lưu lại ở đây. Mở ra để hoàn tất và tạo đơn.</p>
      <ErrorBox error={drafts.error} onRetry={drafts.reload} />
      {drafts.loading && !drafts.data ? (
        <Loading />
      ) : drafts.data?.length ? (
        <div className="order-list">
          {drafts.data.map((o) => (
            <div key={o.id} className="with-actions">
              <OrderCard order={o} showDate={Boolean(o.delivery_date)} to={`/orders/${o.id}/edit`} />
              <div className="row-actions">
                <span className="muted small">Sửa lần cuối {fmtDateTime(o.updated_at)}</span>
                <button type="button" className="link text-error small" onClick={() => remove(o)}>
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="draft" title="Không có đơn nháp" />
      )}
    </div>
  );
}
