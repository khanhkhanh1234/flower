import { useState } from 'react';
import { api } from '../api.js';
import { addDays, fmtDate, isoDate, vnd } from '../format.js';
import { Empty, ErrorBox, Loading, useLoad } from '../components/ui.jsx';

function presets() {
  const t = isoDate();
  const d = new Date();
  const monthStart = isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
  const lastStart = isoDate(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const lastEnd = isoDate(new Date(d.getFullYear(), d.getMonth(), 0));
  return [
    ['today', 'Hôm nay', t, t],
    ['7d', '7 ngày', addDays(t, -6), t],
    ['month', 'Tháng này', monthStart, isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))],
    ['last', 'Tháng trước', lastStart, lastEnd],
  ];
}

export default function Reports() {
  const ps = presets();
  const [range, setRange] = useState({ key: 'month', from: ps[2][2], to: ps[2][3] });
  const rep = useLoad(() => api(`/reports?from=${range.from}&to=${range.to}`), [range.from, range.to]);
  const r = rep.data;
  const maxDay = Math.max(1, ...(r?.days || []).map((d) => d.revenue));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Báo cáo</h1>
      </div>
      <div className="chips">
        {ps.map(([key, label, from, to]) => (
          <button type="button" key={key} className={`chip ${range.key === key ? 'active' : ''}`} onClick={() => setRange({ key, from, to })}>
            {label}
          </button>
        ))}
      </div>
      <div className="row gap wrap filters">
        <label className="inline-field">
          Từ <input type="date" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, key: '', from: e.target.value })} />
        </label>
        <label className="inline-field">
          Đến <input type="date" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, key: '', to: e.target.value })} />
        </label>
      </div>
      <ErrorBox error={rep.error} onRetry={rep.reload} />
      {rep.loading && !r ? (
        <Loading />
      ) : r ? (
        <>
          <div className="stat-grid stat-grid-4">
            <div className="stat stat-pink">
              <span>Doanh thu</span>
              <b>{vnd(r.revenue)}</b>
              <small>Không gồm ship</small>
            </div>
            <div className="stat">
              <span>Số đơn</span>
              <b>{r.order_count}</b>
              <small>{r.cancelled_count} đơn hủy</small>
            </div>
            <div className="stat">
              <span>Tiền ship</span>
              <b>{vnd(r.ship_total)}</b>
            </div>
            <div className="stat">
              <span>Chưa thu</span>
              <b>{vnd(r.remaining_total)}</b>
              <small>Đơn chưa giao xong</small>
            </div>
          </div>

          {r.order_count === 0 ? (
            <Empty icon="chart" title={`Không có đơn từ ${fmtDate(r.from)} đến ${fmtDate(r.to)}`} />
          ) : (
            <>
              <section className="card stack">
                <h3>Doanh thu theo ngày</h3>
                <div className="bars">
                  {r.days.map((d) => (
                    <div key={d.date} className="bar-row" title={`${d.count} đơn`}>
                      <span className="bar-label">{fmtDate(d.date).slice(0, 5)}</span>
                      <span className="bar-track">
                        <span className="bar" style={{ width: `${(d.revenue / maxDay) * 100}%` }} />
                      </span>
                      <span className="bar-value">{vnd(d.revenue)}</span>
                    </div>
                  ))}
                </div>
              </section>
              <div className="grid-2">
                <Table title="Theo nền tảng" rows={r.by_platform} />
                <Table title="Theo nhân viên" rows={r.by_staff} />
              </div>
              <section className="card stack">
                <h3>Mẫu hoa bán chạy</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Mẫu</th>
                      <th className="num">SL</th>
                      <th className="num">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.top_flowers.map((f) => (
                      <tr key={f.name}>
                        <td>{f.name}</td>
                        <td className="num">{f.qty}</td>
                        <td className="num">{vnd(f.amount)}</td>
                      </tr>
                    ))}
                    {!r.top_flowers.length && (
                      <tr>
                        <td colSpan={3} className="muted">
                          Chưa có đơn nào chọn mẫu hoa.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function Table({ title, rows }) {
  return (
    <section className="card stack">
      <h3>{title}</h3>
      <table className="table">
        <thead>
          <tr>
            <th></th>
            <th className="num">Đơn</th>
            <th className="num">Doanh thu</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.name}>
              <td>{x.name}</td>
              <td className="num">{x.count}</td>
              <td className="num">{vnd(x.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
