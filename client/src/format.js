// Formatting, constants and money calculations (mirrors server/src/calc.js).

export const STATUS = {
  pending: { label: 'Chờ xử lý', desc: 'Đơn vừa tiếp nhận, chờ xử lý' },
  making: { label: 'Đang làm', desc: 'Đang làm bó hoa' },
  delivering: { label: 'Đang giao', desc: 'Đang giao tới khách' },
  done: { label: 'Đã giao', desc: 'Đã giao thành công' },
  cancelled: { label: 'Đã hủy', desc: 'Đơn đã bị hủy' },
};
export const FLOW = ['pending', 'making', 'delivering', 'done'];
export const PLATFORMS = ['Facebook', 'Zalo', 'Instagram', 'TikTok', 'Shopee', 'Gọi điện', 'Tại cửa hàng', 'Khác'];
export const DEPOSIT = { none: 'Chưa cọc', partial: 'Cọc 1 phần', full: 'Đã cọc đủ' };

const toInt = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function calcTotals(o) {
  const price = toInt(o.price);
  const ship = toInt(o.ship_fee);
  const extra = toInt(o.extra_cost);
  const discount =
    o.discount_type === 'percent' ? Math.round((price * Math.min(100, toInt(o.discount))) / 100) : toInt(o.discount);
  const total = Math.max(0, price + ship + extra - discount);
  const deposit =
    o.deposit_status === 'full' ? total : o.deposit_status === 'partial' ? Math.min(total, toInt(o.deposit_amount)) : 0;
  return { price, ship, extra, discount, total, deposit, remaining: Math.max(0, total - deposit), revenue: Math.max(0, total - ship) };
}

export const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;
export const num = (n) => (n ? Number(n).toLocaleString('vi-VN') : '');
export const parseNum = (s) => Number(String(s).replace(/\D/g, '')) || 0;

export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}
export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
export function weekday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}
/** "2026-10-18 14:05:00" -> "18/10/2026 14:05" */
export function fmtDateTime(s) {
  if (!s) return '';
  const [date, time = ''] = s.split(' ');
  return `${fmtDate(date)} ${time.slice(0, 5)}`.trim();
}
