// Parse customer chat messages (text + screenshots) into an order draft.
// Uses Gemini when an API key is configured, otherwise a heuristic text parser.
import { calcTotals } from './calc.js';

export function stripVN(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** "1tr1" -> 1100000, "50k" -> 50000, "1.600.000" -> 1600000, "550" (bare, small) -> 550000 */
export function parseMoney(raw) {
  if (raw == null) return null;
  const s = stripVN(raw).replace(/\s+/g, '').replace(/(vnd|d|dong)$/, '');
  let m = /^(\d+)(?:[.,](\d+))?(tr|trieu|m)(\d+)?$/.exec(s);
  if (m) {
    let v = Number(m[1]) * 1e6;
    if (m[2]) v += Number(`0.${m[2]}`) * 1e6;
    if (m[4]) v += Number(m[4].padEnd(3, '0').slice(0, 3)) * 1e3;
    return Math.round(v);
  }
  m = /^(\d+(?:[.,]\d+)?)(k|ng|nghin|ngan)$/.exec(s);
  if (m) return Math.round(Number(m[1].replace(',', '.')) * 1e3);
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n > 0 && n < 10000 ? n * 1000 : n;
  }
  return null;
}

const MONEY = String.raw`(\d+(?:[.,]\d+)*\s*(?:tr(?:iệu)?\d*|k|nghìn|ngàn|đ|vnđ|vnd)?)`;
const PHONE_RE = /(?<!\d)(?:\+84|0)(?:[\s.]?\d){8,9}(?!\d)/g;
const UNITS = 'bó|cành|bình|giỏ|hộp|lẵng|chậu|kệ|cái|bông';

function normPhone(p) {
  const d = p.replace(/[\s.]/g, '');
  return d.startsWith('+84') ? `0${d.slice(3)}` : d;
}

function cleanName(s) {
  return String(s || '')
    .replace(/[,.;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchFlower(name, flowers) {
  const n = stripVN(name).replace(/^hoa\s+/, '');
  if (!n) return null;
  let best = null;
  for (const f of flowers) {
    const fn = stripVN(f.name).replace(/^hoa\s+/, '');
    if (fn === n) return f;
    if (fn.includes(n) || n.includes(fn)) {
      if (!best || fn.length > stripVN(best.name).length) best = f;
    }
  }
  return best;
}

function toISODate(d, mo, y, today) {
  const now = today || new Date();
  let year = y ? Number(y) : now.getFullYear();
  if (year < 100) year += 2000;
  const dd = Number(d);
  const mm = Number(mo);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function heuristicParse(text, flowers = [], today = new Date()) {
  const out = {
    order_for: 'self',
    customer_name: '',
    customer_phone: '',
    recipient_name: '',
    recipient_phone: '',
    address: '',
    delivery_date: '',
    delivery_time: '',
    price: null,
    ship_fee: null,
    deposit_amount: null,
    deposit_percent: null,
    deposit_status: 'none',
    items: [],
    product_summary: '',
    note: '',
  };
  const lines = String(text || '')
    .normalize('NFC')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const full = lines.join('\n');

  // Labeled fields ("Người đặt: X", "sdt người nhận: Y", ...)
  for (const line of lines) {
    const l = stripVN(line);
    const val = line.includes(':') ? line.slice(line.indexOf(':') + 1).trim() : '';
    if (/^(nguoi|ten) (dat|khach)\s*:/.test(l)) out.customer_name = cleanName(val);
    else if (/^(nguoi|ten) nhan\s*:/.test(l)) out.recipient_name = cleanName(val);
    else if (/^(dia chi|dc|d\/c)( giao| nhan)?\s*:/.test(l)) out.address = cleanName(val);
    else if (/^(note|ghi chu|loi nhan|thiep)( la)?\s*:/.test(l)) out.note = cleanName(val);
  }

  // Phones, attributed by line context
  for (const line of lines) {
    const l = stripVN(line);
    for (const p of line.match(PHONE_RE) || []) {
      const phone = normPhone(p);
      const isRecipient = /nhan|giao cho|dat cho|gui cho|tang/.test(l) && !/sdt (khach|minh)/.test(l);
      if (isRecipient && !out.recipient_phone) out.recipient_phone = phone;
      else if (!out.customer_phone) out.customer_phone = phone;
      else if (!out.recipient_phone) out.recipient_phone = phone;
    }
  }

  // "X, sdt mình là ..." -> customer name; "giao cho Y" / "X đặt cho Y"
  const nameBeforePhone = /(?:^|\n)\s*([^\n,:\d]{2,40}?)\s*,\s*(?:sdt|sđt|số điện thoại|đt)/i.exec(full);
  if (!out.customer_name && nameBeforePhone) out.customer_name = cleanName(nameBeforePhone[1]);
  const datCho = /([^\n,:\d]{2,40}?)\s+đặt\s+cho\s+([^\n,\d]{2,40})/i.exec(full);
  if (datCho) {
    if (!out.customer_name) out.customer_name = cleanName(datCho[1]);
    if (!out.recipient_name) out.recipient_name = cleanName(datCho[2]);
  }
  const giaoCho = /(?:giao|gửi|tặng)\s+cho\s+([^\n,\d]{2,40})/i.exec(full);
  if (giaoCho && !out.recipient_name) out.recipient_name = cleanName(giaoCho[1]);

  if (!out.address) {
    const m = /(?:đ\/c|đc|dc|địa chỉ)\s*:?\s*([^\n]+?)(?=,\s*giao\b|\n|$)/i.exec(full);
    if (m) out.address = cleanName(m[1]);
  }
  if (!out.address) {
    const m = /(?:^|\s)(?:ở|tại)\s+(\d+[^\n,]*?)(?:\s+(?:nhé|nha|nhá|ạ|nhe))*\s*(?:[,.!]|\n|$)/i.exec(full);
    if (m) out.address = cleanName(m[1]);
  }

  // Delivery date/time: prefer a line mentioning "giao"
  const dateLines = [...lines.filter((l) => /giao/i.test(l)), ...lines];
  for (const line of dateLines) {
    if (/^(note|ghi chú)/i.test(line)) continue;
    const dm = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(line);
    if (dm && !out.delivery_date) out.delivery_date = toISODate(dm[1], dm[2], dm[3], today) || '';
    const tm = /\b(\d{1,2})\s*(?:h|giờ|:)\s*(\d{2})?\b/i.exec(line.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ''));
    if (tm && !out.delivery_time && Number(tm[1]) < 24) {
      out.delivery_time = `${tm[1].padStart(2, '0')}:${(tm[2] || '00').padStart(2, '0')}`;
    }
  }

  // Money
  const grab = (re) => {
    const m = re.exec(full);
    return m ? parseMoney(m[1]) : null;
  };
  out.ship_fee = grab(new RegExp(String.raw`(?:tiền\s+)?ship\s*(?:là|:)?\s*${MONEY}`, 'i'));
  const pct = /cọc\s*(\d{1,3})\s*%/i.exec(full);
  if (pct) out.deposit_percent = Math.min(100, Number(pct[1]));
  else out.deposit_amount = grab(new RegExp(String.raw`(?:đã\s+)?cọc\s*(?:là|:)?\s*${MONEY}`, 'i'));
  if (/(cọc|chuyển khoản|thanh toán)\s+(đủ|hết|full)/i.test(full)) out.deposit_status = 'full';
  out.price = grab(new RegExp(String.raw`(?:tổng(?:\s+tiền)?(?:\s+\S+){0,3}?\s+là|tổng\s*:|giá\s*(?:là|:)?)\s*${MONEY}`, 'i'));

  // Items: "4 bó hoa hồng đỏ và 2 bó lan trắng"
  const itemRe = new RegExp(String.raw`(\d+)\s*(${UNITS})\s+([^\n,.;]+?)(?=\s+(?:và|với|\+)\s+\d|[,.;\n]|$)`, 'gi');
  const summaryParts = [];
  for (const m of full.matchAll(itemRe)) {
    const name = cleanName(m[3]);
    const f = matchFlower(name, flowers);
    out.items.push({
      flower_id: f?.id ?? null,
      name: f?.name ?? name.charAt(0).toUpperCase() + name.slice(1),
      unit_price: f?.price ?? 0,
      qty: Number(m[1]),
    });
    summaryParts.push(`${m[1]} ${m[2]} ${name}`);
  }
  // Lines like "hoa hồng sophia" with no quantity
  if (!out.items.length) {
    for (const line of lines) {
      if (/^hoa\s+/i.test(line) && !line.includes(':')) {
        const f = matchFlower(line, flowers);
        out.items.push({ flower_id: f?.id ?? null, name: f?.name ?? cleanName(line), unit_price: f?.price ?? 0, qty: 1 });
        summaryParts.push(cleanName(line));
      }
    }
  }
  out.product_summary = summaryParts.join(' và ');

  if (out.recipient_name && stripVN(out.recipient_name) !== stripVN(out.customer_name)) out.order_for = 'gift';
  return out;
}

const fmt = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

/** Normalize parser output: resolve deposit percent/status, clean types. */
export function finalizeDraft(d) {
  const items = Array.isArray(d.items) ? d.items : [];
  const itemSum = items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.qty) || 1), 0);
  const price = Number(d.price) > 0 ? Math.round(Number(d.price)) : itemSum || null;
  const ship = Number(d.ship_fee) > 0 ? Math.round(Number(d.ship_fee)) : null;
  const discount_type = d.discount_type === 'percent' ? 'percent' : 'vnd';
  const discount = Number(d.discount) > 0 ? Math.round(Math.min(Number(d.discount), discount_type === 'percent' ? 100 : Infinity)) : null;
  const extra = Number(d.extra_cost) > 0 ? Math.round(Number(d.extra_cost)) : null;
  const { total } = calcTotals({ price, ship_fee: ship, discount, discount_type, extra_cost: extra });
  let status = ['none', 'partial', 'full'].includes(d.deposit_status) ? d.deposit_status : 'none';
  let amount = Number(d.deposit_amount) > 0 ? Math.round(Number(d.deposit_amount)) : null;
  const pct = Number(d.deposit_percent);
  if (!amount && pct > 0) amount = Math.round((total * Math.min(100, pct)) / 100);
  if (status === 'none' && amount) status = 'partial';
  if (status === 'full') amount = total;
  const s = (v) => (v == null ? '' : String(v).trim());
  const out = {
    order_for: d.order_for === 'gift' || (s(d.recipient_name) && s(d.recipient_name) !== s(d.customer_name)) ? 'gift' : 'self',
    customer_name: s(d.customer_name),
    customer_phone: s(d.customer_phone),
    recipient_name: s(d.recipient_name),
    recipient_phone: s(d.recipient_phone),
    address: s(d.address),
    delivery_date: /^\d{4}-\d{2}-\d{2}$/.test(s(d.delivery_date)) ? s(d.delivery_date) : '',
    delivery_time: /^\d{2}:\d{2}$/.test(s(d.delivery_time)) ? s(d.delivery_time) : '',
    price,
    ship_fee: ship,
    discount,
    discount_type,
    extra_cost: extra,
    deposit_status: status,
    deposit_amount: amount,
    items,
    product_summary: s(d.product_summary) || items.map((it) => `${it.qty} ${it.name}`).join(', '),
    note: s(d.note),
  };
  if (out.order_for === 'self') {
    out.recipient_name = '';
    out.recipient_phone = '';
  }
  return out;
}

/** Short confirmation message the shop can send back to the customer. */
export function buildReply(d) {
  const lines = ['Dạ shop xác nhận đơn của mình ạ:'];
  if (d.product_summary) lines.push(`- Hoa: ${d.product_summary}`);
  if (d.customer_name || d.customer_phone)
    lines.push(`- Người đặt: ${[d.customer_name, d.customer_phone].filter(Boolean).join(' - ')}`);
  if (d.order_for === 'gift' && (d.recipient_name || d.recipient_phone))
    lines.push(`- Người nhận: ${[d.recipient_name, d.recipient_phone].filter(Boolean).join(' - ')}`);
  if (d.address) lines.push(`- Giao tới: ${d.address}`);
  if (d.delivery_date) {
    const [y, m, day] = d.delivery_date.split('-');
    lines.push(`- Ngày giao: ${day}/${m}/${y}${d.delivery_time ? ` lúc ${d.delivery_time}` : ''}`);
  }
  const t = calcTotals(d);
  if (d.price) {
    const parts = [`${fmt(d.price)}`];
    if (d.extra_cost) parts.push(`phụ phí ${fmt(d.extra_cost)}`);
    if (d.ship_fee) parts.push(`ship ${fmt(d.ship_fee)}`);
    let line = `- Tiền hoa: ${parts.join(' + ')}`;
    if (t.discount) line += ` − giảm ${d.discount_type === 'percent' ? `${d.discount}% (${fmt(t.discount)})` : fmt(t.discount)}`;
    lines.push(`${line} = ${fmt(t.total)}`);
  }
  if (t.deposit) lines.push(`- Cọc: ${fmt(t.deposit)}, còn lại ${fmt(t.remaining)}`);
  if (d.note) lines.push(`- Lời nhắn: ${d.note}`);
  lines.push('Mình kiểm tra giúp shop nhé, cảm ơn mình ạ!');
  return lines.join('\n');
}

const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
/** Next 8 days with Vietnamese weekday names so the model doesn't have to do calendar math. */
function calendar(today) {
  const base = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return '';
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(base.getTime() + i * 86400000);
    return `${WEEKDAY[d.getUTCDay()]} = ${d.toISOString().slice(0, 10)}${i === 0 ? ' (hôm nay)' : i === 1 ? ' (mai)' : ''}`;
  }).join('; ');
}

const PROMPT = (flowers, today) => `Bạn là trợ lý của tiệm hoa. Đọc tin nhắn/ảnh chụp cuộc trò chuyện với khách và trích xuất thông tin đơn hàng.
Hôm nay là ${today}. Lịch các ngày tới: ${calendar(today)}. Danh sách mẫu hoa của tiệm (tên - giá VNĐ):
${flowers.map((f) => `- ${f.name} - ${f.price}`).join('\n') || '(chưa có)'}

Trả về DUY NHẤT JSON với các khóa:
{"order_for":"self"|"gift","customer_name":"","customer_phone":"","recipient_name":"","recipient_phone":"","address":"","delivery_date":"YYYY-MM-DD","delivery_time":"HH:mm","price":number|null,"ship_fee":number|null,"discount":number|null,"discount_type":"vnd"|"percent","extra_cost":number|null,"deposit_status":"none"|"partial"|"full","deposit_amount":number|null,"deposit_percent":number|null,"items":[{"name":"","qty":number,"unit_price":number}],"product_summary":"","note":""}
Quy tắc: tiền tính bằng VNĐ (1tr1 = 1100000, 50k = 50000). "price" là tiền hoa khách được báo TRƯỚC giảm giá (không gồm ship, không gồm phụ phí). Giảm giá/chiết khấu ghi vào "discount" (giảm theo % thì discount_type="percent", discount là số %). Phụ phí cộng thêm (thiệp, tăng size, thêm hoa…) ghi vào "extra_cost". "freeship" thì ship_fee=0. Tiền khách đã chuyển khoản/ck trước là tiền cọc. Nếu khách đặt tặng người khác thì order_for="gift", "address" là địa chỉ người nhận. Nếu cọc theo phần trăm thì điền deposit_percent. Ưu tiên tên mẫu hoa trong danh sách nếu khớp. "note" là lời nhắn/ghi chú thiệp. "product_summary" mô tả ngắn hoa khách đặt. Trường không rõ để chuỗi rỗng hoặc null, KHÔNG tự đoán ngày giao từ nội dung lời chúc.`;

export async function geminiParse({ apiKey, model, messages, flowers, today, fetchImpl = fetch, timeoutMs = 60000 }) {
  const parts = [{ text: PROMPT(flowers, today) }];
  for (const m of messages) {
    if (m.text) parts.push({ text: `Tin nhắn khách: ${m.text}` });
    for (const img of m.images || []) {
      const dm = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(img);
      if (dm) parts.push({ inline_data: { mime_type: dm[1], data: dm[2] } });
    }
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini lỗi ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const txt = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '{}';
  const json = JSON.parse(txt.replace(/^```(?:json)?|```$/g, '').trim());
  // Link items to catalogue
  json.items = (Array.isArray(json.items) ? json.items : []).map((it) => {
    const f = matchFlower(it.name, flowers);
    return {
      flower_id: f?.id ?? null,
      name: f?.name ?? String(it.name || ''),
      unit_price: Number(it.unit_price) || f?.price || 0,
      qty: Math.max(1, Number(it.qty) || 1),
    };
  });
  return json;
}
