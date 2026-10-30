import { Link } from 'react-router-dom';
import Icon from '../icons.jsx';
import { STATUS, fmtDate, vnd } from '../format.js';
import { StatusPill } from './ui.jsx';
import { small } from '../image.js';

export default function OrderCard({ order: o, showDate, to }) {
  return (
    <Link to={to || `/orders/${o.id}`} className={`order-card ${o.status === 'cancelled' ? 'is-cancelled' : ''}`}>
      <div className="order-thumb">
        {o.thumb_url ? <img src={small(o.thumb_url)} alt="" loading="lazy" /> : <Icon name="flower" size={26} />}
      </div>
      <div className="order-main">
        <div className="order-top">
          <span className="order-id">#{o.id}</span>
          {(showDate || o.delivery_time) && (
            <span className="order-time">
              <Icon name="clock" size={13} />
              {showDate && fmtDate(o.delivery_date)} {o.delivery_time}
            </span>
          )}
          {!o.is_draft && <StatusPill status={o.status} />}
        </div>
        <div className="order-name">
          {o.customer_name || <i className="muted">Chưa có tên</i>}
          {o.order_for === 'gift' && o.recipient_name && (
            <>
              {' '}
              <Icon name="gift" size={14} className="text-pink" /> {o.recipient_name}
            </>
          )}
        </div>
        {o.product_summary && <div className="order-desc">{o.product_summary}</div>}
        {(o.status === 'making' || o.status === 'delivering') && o.status_by && (
          <div className="order-addr">
            <Icon name="users" size={13} /> {STATUS[o.status].label}: {o.status_by.split('@')[0]}
          </div>
        )}
        {o.address && (
          <div className="order-addr">
            <Icon name="pin" size={13} /> {o.address}
          </div>
        )}
      </div>
      <div className="order-money">
        <b>{vnd(o.totals.total)}</b>
        {o.totals.remaining > 0 && o.totals.remaining !== o.totals.total && <span className="muted small">Còn {vnd(o.totals.remaining)}</span>}
        {o.totals.remaining === 0 && o.totals.total > 0 && <span className="text-ok small">Đã thanh toán</span>}
      </div>
    </Link>
  );
}
