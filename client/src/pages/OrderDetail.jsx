import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, uploadImage } from '../api.js';
import Icon from '../icons.jsx';
import { FLOW, STATUS, fmtDate, fmtDateTime, vnd } from '../format.js';
import { compressImage } from '../image.js';
import PaymentSummary from '../components/PaymentSummary.jsx';
import { ErrorBox, Loading, Modal, StatusPill, confirmAsk, useLoad, useToast } from '../components/ui.jsx';

const MAX_IMAGES = 10;

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const order = useLoad(() => api(`/orders/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState(null);

  if (order.error && !order.data) return <div className="page"><ErrorBox error={order.error} onRetry={order.reload} /></div>;
  if (!order.data) return <Loading />;
  const o = order.data;
  if (o.is_draft) return <Navigate to={`/orders/${o.id}/edit`} replace />;

  const setStatus = async (status) => {
    setBusy(true);
    try {
      order.setData(await api(`/orders/${o.id}/status`, { method: 'POST', body: { status, from: o.status } }));
      toast(`Đã chuyển sang "${STATUS[status].label}"`);
    } catch (e) {
      toast(e.message, 'error');
      if (e.status === 409) order.reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmAsk('Xóa đơn này? Đơn sẽ được chuyển vào Rác và có thể khôi phục.')) return;
    await api(`/orders/${o.id}`, { method: 'DELETE' });
    toast('Đã chuyển đơn vào Rác');
    navigate(-1);
  };

  const addImages = async (files) => {
    const room = MAX_IMAGES - o.images.length;
    setBusy(true);
    try {
      for (const f of files.slice(0, room)) await uploadImage(`/orders/${o.id}/images`, await compressImage(f));
      if (files.length > room) toast(`Tối đa ${MAX_IMAGES} ảnh`, 'error');
      order.reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const removeImage = async (img) => {
    if (!confirmAsk('Xóa ảnh này?')) return;
    await api(`/orders/${o.id}/images/${img.id}`, { method: 'DELETE' });
    setViewer(null);
    order.reload();
  };

  const eventOf = (s) => [...o.events].reverse().find((e) => e.status === s);
  const curIdx = FLOW.indexOf(o.status);
  const next = o.status !== 'cancelled' && curIdx < FLOW.length - 1 ? FLOW[curIdx + 1] : null;

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Quay lại">
          <Icon name="left" />
        </button>
        <h1>Đơn #{o.id}</h1>
        <StatusPill status={o.status} />
        <Link to={`/orders/${o.id}/edit`} className="btn btn-soft btn-sm ml-auto">
          <Icon name="edit" size={16} /> Sửa
        </Link>
      </div>

      <section className="card stack">
        <PaymentSummary order={o} />
        <p className="muted small">
          Tạo đơn: {fmtDateTime(o.created_at)}
          {o.created_by && ` · bởi ${o.created_by}`}
        </p>
      </section>

      <section className="card">
        <h3 className="section-label">Tiến trình đơn</h3>
        <ol className="timeline">
          {(o.status === 'cancelled' ? [...FLOW.filter((s) => eventOf(s)), 'cancelled'] : FLOW).map((s) => {
            const ev = eventOf(s);
            const doneStep = o.status === 'cancelled' ? true : FLOW.indexOf(s) <= curIdx;
            return (
              <li key={s} className={`${doneStep ? 'done' : ''} ${s === o.status ? 'current' : ''} step-${s}`}>
                <span className="dot">{doneStep && <Icon name={s === 'cancelled' ? 'x' : 'check'} size={12} />}</span>
                <div>
                  <b>{STATUS[s].label}</b>
                  <p>{STATUS[s].desc}</p>
                  {ev && (
                    <small className="muted">
                      {fmtDateTime(ev.created_at)}
                      {ev.by_user && ` · ${ev.by_user}`}
                    </small>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="row gap wrap">
          {next && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus(next)}>
              Đánh dấu: {STATUS[next].label}
            </button>
          )}
          {o.status !== 'cancelled' && o.status !== 'done' && (
            <button type="button" className="btn btn-danger-ghost" disabled={busy} onClick={() => confirmAsk('Hủy đơn này?') && setStatus('cancelled')}>
              Đã hủy
            </button>
          )}
          {(o.status === 'cancelled' || o.status === 'done') && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setStatus('pending')}>
              <Icon name="restore" size={16} /> Mở lại đơn
            </button>
          )}
        </div>
      </section>

      <section className="card stack">
        <h3 className="section-label">Sản phẩm</h3>
        {o.product_summary && <p className="pre">{o.product_summary}</p>}
        {o.items.map((it) => (
          <div key={it.id} className="item-row">
            <span className="thumb-sm">{it.image_url ? <img src={it.image_url} alt="" /> : <Icon name="flower" size={16} />}</span>
            <div className="item-info">
              <b>
                {it.name} × {it.qty}
              </b>
              <span className="muted small">{vnd(it.unit_price)} / bó</span>
              {it.flower_id && (
                <Link to={`/flowers?id=${it.flower_id}`} className="link small">
                  Xem mẫu hoa →
                </Link>
              )}
            </div>
            <b className="item-total">{vnd(it.unit_price * it.qty)}</b>
          </div>
        ))}
      </section>

      <section className="card stack">
        <div className="info-row">
          <span className="muted">Người đặt</span>
          <div>
            {o.customer_id ? <Link to={`/customers/${o.customer_id}`}>{o.customer_name}</Link> : o.customer_name}
            {o.customer_phone && (
              <a className="phone" href={`tel:${o.customer_phone}`}>
                <Icon name="phone" size={14} /> {o.customer_phone}
              </a>
            )}
          </div>
        </div>
        {o.order_for === 'gift' && (
          <div className="info-row">
            <span className="muted">
              <Icon name="gift" size={14} className="text-pink" /> Người nhận
            </span>
            <div>
              {o.recipient_name}
              {o.recipient_phone && (
                <a className="phone" href={`tel:${o.recipient_phone}`}>
                  <Icon name="phone" size={14} /> {o.recipient_phone}
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="card stack">
        <h3 className="section-label">Giao hàng</h3>
        <dl className="kv">
          <dt>Ngày giờ</dt>
          <dd>
            {fmtDate(o.delivery_date)} {o.delivery_time}
          </dd>
          <dt>Địa chỉ</dt>
          <dd>{o.address || '—'}</dd>
          <dt>NV gói hoa</dt>
          <dd>{o.staff_name || '—'}</dd>
          <dt>Cơ sở</dt>
          <dd>{o.branch_name || '—'}</dd>
          <dt>Nền tảng</dt>
          <dd>{o.platform || '—'}</dd>
        </dl>
      </section>

      <section className="card stack">
        <div className="card-head">
          <h3 className="section-label">Ảnh đơn ({o.images.length})</h3>
          <span className="muted small">
            {o.images.length}/{MAX_IMAGES} ảnh
          </span>
        </div>
        <div className="thumbs thumbs-lg">
          {o.images.map((img) => (
            <button type="button" key={img.id} className="thumb" onClick={() => setViewer(img)}>
              <img src={img.url} alt="" loading="lazy" />
            </button>
          ))}
          {o.images.length < MAX_IMAGES && (
            <label className="thumb thumb-add">
              <Icon name="plus" />
              <input type="file" accept="image/*" multiple hidden onChange={(e) => (addImages([...e.target.files]), (e.target.value = ''))} />
            </label>
          )}
        </div>
      </section>

      {o.note && (
        <section className="card stack">
          <h3 className="section-label">Ghi chú</h3>
          <p className="pre">{o.note}</p>
        </section>
      )}

      <div className="action-bar">
        <button type="button" className="btn btn-danger-ghost" onClick={remove}>
          <Icon name="trash" size={16} /> Xóa đơn
        </button>
        <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>
          Xong
        </button>
      </div>

      {viewer && (
        <Modal
          title="Ảnh đơn"
          onClose={() => setViewer(null)}
          wide
          footer={
            <button type="button" className="btn btn-danger-ghost" onClick={() => removeImage(viewer)}>
              <Icon name="trash" size={16} /> Xóa ảnh
            </button>
          }
        >
          <img src={viewer.url} alt="" className="viewer-img" />
        </Modal>
      )}
    </div>
  );
}
