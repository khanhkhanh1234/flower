import { Fragment } from 'react';
import { calcTotals, vnd } from '../format.js';

/** "Chi tiết thanh toán" breakdown used on the form and the detail page. */
export default function PaymentSummary({ order: o }) {
  const t = calcTotals(o);
  const items = o.items || [];
  const itemSum = items.reduce((s, i) => s + i.unit_price * i.qty, 0);
  return (
    <div className="pay">
      <div className="pay-row">
        <span>Tiền hoa</span>
        <b>{vnd(t.price)}</b>
      </div>
      {items.map((i, k) => (
        <Fragment key={k}>
          <div className="pay-row pay-sub">
            <span>
              {i.name}: {vnd(i.unit_price)} × {i.qty}
            </span>
            <span>= {vnd(i.unit_price * i.qty)}</span>
          </div>
        </Fragment>
      ))}
      {items.length > 0 && itemSum !== t.price && (
        <div className="pay-row pay-sub">
          <span className="text-warn">Giá đã chỉnh khác tổng mẫu hoa ({vnd(itemSum)})</span>
        </div>
      )}
      {t.ship > 0 && (
        <div className="pay-row">
          <span>Tiền ship</span>
          <span>+ {vnd(t.ship)}</span>
        </div>
      )}
      {t.extra > 0 && (
        <div className="pay-row">
          <span>Chi phí phát sinh</span>
          <span>+ {vnd(t.extra)}</span>
        </div>
      )}
      {t.discount > 0 && (
        <div className="pay-row">
          <span>Chiết khấu{o.discount_type === 'percent' ? ` (${o.discount}%)` : ''}</span>
          <span>− {vnd(t.discount)}</span>
        </div>
      )}
      <div className="pay-row pay-total">
        <span>Tổng đơn</span>
        <b>{vnd(t.total)}</b>
      </div>
      {t.deposit > 0 && (
        <div className="pay-row">
          <span>Đã cọc</span>
          <span>− {vnd(t.deposit)}</span>
        </div>
      )}
      <div className="pay-row pay-due">
        <span>Khách cần trả</span>
        <b>{vnd(t.remaining)}</b>
      </div>
    </div>
  );
}
