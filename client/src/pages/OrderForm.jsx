import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, uploadImage } from '../api.js';
import Icon from '../icons.jsx';
import { DEPOSIT, PLATFORMS, isoDate, vnd } from '../format.js';
import { dataURLToBlob, small } from '../image.js';
import AiModal from '../components/AiModal.jsx';
import PaymentSummary from '../components/PaymentSummary.jsx';
import { CustomerPicker, FlowerPicker, ImageDrop } from '../components/pickers.jsx';
import { ErrorBox, Field, Loading, MoneyInput, Segmented, confirmAsk, useLoad, useToast } from '../components/ui.jsx';

const MAX_IMAGES = 10;
const summarize = (items) => items.map((i) => `${i.qty} ${i.name}`).join(', ');
const itemSum = (items) => items.reduce((s, i) => s + i.unit_price * i.qty, 0);
let keySeq = 0;
const imgKey = () => `k${++keySeq}`;

const blank = (date) => ({
  order_for: 'self',
  customer_id: null,
  customer_name: '',
  customer_phone: '',
  recipient_name: '',
  recipient_phone: '',
  address: '',
  delivery_date: date,
  delivery_time: '',
  platform: '',
  price: 0,
  ship_fee: 0,
  discount: 0,
  discount_type: 'vnd',
  extra_cost: 0,
  deposit_status: 'none',
  deposit_amount: 0,
  product_summary: '',
  branch_id: '',
  staff_id: '',
  note: '',
  items: [],
});

export default function OrderForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState(null);
  const [isDraft, setIsDraft] = useState(false);
  const [version, setVersion] = useState(null);
  const [images, setImages] = useState([]); // {key, id?, url, blob?}
  const [removed, setRemoved] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [pickCustomer, setPickCustomer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState('');

  const flowers = useLoad(() => api('/flowers'), []);
  const branches = useLoad(() => api('/branches'), []);
  const staff = useLoad(() => api('/staff'), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (id) {
          const o = await api(`/orders/${id}`);
          if (!alive) return;
          setIsDraft(o.is_draft);
          setVersion(o.version ?? null);
          setF({
            ...blank(''),
            ...Object.fromEntries(Object.keys(blank('')).map((k) => [k, o[k] ?? blank('')[k]])),
            branch_id: o.branch_id || '',
            staff_id: o.staff_id || '',
            items: o.items.map(({ flower_id, name, unit_price, qty, image_url }) => ({ flower_id, name, unit_price, qty, image_url })),
          });
          setImages(o.images.map((im) => ({ key: imgKey(), id: im.id, url: im.url })));
        } else {
          const d = params.get('date');
          const base = blank(/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : isoDate());
          const cid = params.get('customer');
          if (cid) {
            const c = await api(`/customers/${encodeURIComponent(cid)}`).catch(() => null);
            if (c) Object.assign(base, { customer_id: c.id, customer_name: c.name, customer_phone: c.phone || '', address: c.address || '' });
          }
          if (alive) setF(base);
        }
      } catch (e) {
        if (alive) setLoadError(e.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, params]);

  // Revoke local preview URLs on unmount
  useEffect(() => () => images.forEach((i) => i.blob && URL.revokeObjectURL(i.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <div className="page"><ErrorBox error={loadError} /></div>;
  if (!f) return <Loading />;

  const set = (patch) => {
    setF((cur) => ({ ...cur, ...patch }));
    setErrors((e) => {
      const n = { ...e };
      Object.keys(patch).forEach((k) => delete n[k]);
      return n;
    });
  };

  const setItems = (items) =>
    setF((cur) => {
      const autoSummary = !cur.product_summary || cur.product_summary === summarize(cur.items);
      return {
        ...cur,
        items,
        price: items.length ? itemSum(items) : cur.price,
        product_summary: autoSummary ? summarize(items) : cur.product_summary,
      };
    });

  const addFlower = (fl) => {
    const idx = f.items.findIndex((i) => i.flower_id === fl.id);
    if (idx >= 0) setItems(f.items.map((i, k) => (k === idx ? { ...i, qty: i.qty + 1 } : i)));
    else setItems([...f.items, { flower_id: fl.id, name: fl.name, unit_price: fl.price, qty: 1, image_url: fl.image_url }]);
    setErrors((e) => ({ ...e, product_summary: undefined }));
  };
  const updateItem = (k, patch) => setItems(f.items.map((i, j) => (j === k ? { ...i, ...patch } : i)));

  const addBlobs = (blobs) =>
    setImages((cur) => [...cur, ...blobs.slice(0, MAX_IMAGES - cur.length).map((b) => ({ key: imgKey(), blob: b, url: URL.createObjectURL(b) }))]);
  const removeImage = (key) =>
    setImages((cur) => {
      const img = cur.find((i) => i.key === key);
      if (img?.id) setRemoved((r) => [...r, img.id]);
      if (img?.blob) URL.revokeObjectURL(img.url);
      return cur.filter((i) => i.key !== key);
    });

  const applyAi = async (d, dataUrls) => {
    setF((cur) => {
      const items = d.items?.length
        ? d.items.map((it) => ({ ...it, image_url: flowers.data?.find((x) => x.id === it.flower_id)?.image_url }))
        : cur.items;
      return {
        ...cur,
        order_for: d.order_for,
        customer_id: d.customer_name ? null : cur.customer_id,
        customer_name: d.customer_name || cur.customer_name,
        customer_phone: d.customer_phone || cur.customer_phone,
        recipient_name: d.recipient_name || cur.recipient_name,
        recipient_phone: d.recipient_phone || cur.recipient_phone,
        address: d.address || cur.address,
        delivery_date: d.delivery_date || cur.delivery_date,
        delivery_time: d.delivery_time || cur.delivery_time,
        items,
        // Keep the price quoted to the customer; fall back to the sum of flower models.
        price: d.price || (d.items?.length ? itemSum(items) : cur.price),
        ship_fee: d.ship_fee ?? cur.ship_fee,
        discount: d.discount ?? cur.discount,
        discount_type: d.discount ? d.discount_type : cur.discount_type,
        extra_cost: d.extra_cost ?? cur.extra_cost,
        deposit_status: d.deposit_status !== 'none' ? d.deposit_status : cur.deposit_status,
        deposit_amount: d.deposit_amount ?? cur.deposit_amount,
        product_summary: d.product_summary || cur.product_summary,
        note: d.note || cur.note,
      };
    });
    setErrors({});
    setAiOpen(false);
    const blobs = [];
    for (const u of dataUrls) blobs.push(await dataURLToBlob(u));
    if (blobs.length) addBlobs(blobs);
    toast('Đã điền thông tin từ AI — kiểm tra lại trước khi tạo đơn');
  };

  const validate = () => {
    const e = {};
    if (!f.customer_name.trim()) e.customer_name = 'Nhập tên khách';
    if (f.order_for === 'gift' && !f.recipient_name.trim()) e.recipient_name = 'Nhập tên người nhận';
    if (!f.delivery_date) e.delivery_date = 'Chọn ngày giao';
    if (!f.product_summary.trim()) e.product_summary = 'Nhập mô tả hoa';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async (asDraft) => {
    if (!asDraft && !validate()) {
      toast('Còn thiếu thông tin bắt buộc', 'error');
      document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...f,
        branch_id: f.branch_id || null,
        staff_id: f.staff_id || null,
        items: f.items.map(({ flower_id, name, unit_price, qty }) => ({ flower_id, name, unit_price, qty })),
        is_draft: asDraft,
        version: id ? version : undefined,
      };
      if (id && !isDraft) delete body.is_draft;
      const o = id ? await api(`/orders/${id}`, { method: 'PUT', body }) : await api('/orders', { method: 'POST', body });
      let failed = 0;
      for (const rid of removed) await api(`/orders/${o.id}/images/${rid}`, { method: 'DELETE' }).catch(() => failed++);
      for (const img of images.filter((i) => i.blob)) await uploadImage(`/orders/${o.id}/images`, img.blob).catch(() => failed++);
      if (failed) toast(`${failed} ảnh lỗi khi tải lên`, 'error');
      toast(asDraft ? 'Đã lưu đơn nháp' : id && !isDraft ? 'Đã lưu thay đổi' : 'Đã tạo đơn');
      navigate(asDraft ? '/drafts' : `/orders/${o.id}`, { replace: true });
    } catch (e) {
      if (e.status === 409) {
        if (confirmAsk(`${e.message}\n\nMở bản mới nhất? (Thay đổi bạn vừa nhập sẽ không được lưu)`))
          navigate(isDraft ? '/drafts' : `/orders/${id}`, { replace: true });
      } else toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const staffList = (staff.data || []).filter((s) => !f.branch_id || s.branch_id === Number(f.branch_id));
  const isGift = f.order_for === 'gift';
  const err = (k) => errors[k] && <span className="error-text">{errors[k]}</span>;
  const title = !id ? 'Đơn mới' : isDraft ? 'Sửa đơn nháp' : `Sửa đơn #${id}`;

  return (
    <div className="page page-form">
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Quay lại">
          <Icon name="left" />
        </button>
        <h1>{title}</h1>
      </div>

      <button type="button" className="ai-banner" onClick={() => setAiOpen(true)}>
        <Icon name="sparkles" size={22} />
        <span>
          <b>Tạo đơn bằng AI</b>
          <small>Dán tin nhắn / ảnh chụp đoạn chat của khách — AI tự điền đơn</small>
        </span>
        <Icon name="right" size={18} />
      </button>

      <form className="stack" noValidate onSubmit={(e) => (e.preventDefault(), save(false))}>
        {/* Khách hàng */}
        <section className="card stack">
          <div className="card-head">
            <h3>Khách hàng</h3>
            <button type="button" className="link" onClick={() => setPickCustomer(true)}>
              <Icon name="left" size={14} /> Chọn khách cũ
            </button>
          </div>
          <Segmented
            options={[
              ['self', 'Đặt cho bản thân'],
              ['gift', 'Đặt giúp / tặng'],
            ]}
            value={f.order_for}
            onChange={(v) => set({ order_for: v })}
          />
          {f.customer_id && (
            <div className="chip-info">
              Khách cũ #{f.customer_id}
              <button type="button" className="link small" onClick={() => set({ customer_id: null })}>
                Bỏ chọn
              </button>
            </div>
          )}
          <div className="grid-2">
            <Field label="Tên khách" required className={errors.customer_name ? 'has-error' : ''}>
              <input value={f.customer_name} onChange={(e) => set({ customer_name: e.target.value })} placeholder="VD: Minh Trí" />
              {err('customer_name')}
            </Field>
            <Field label="Số điện thoại">
              <input type="tel" inputMode="tel" value={f.customer_phone} onChange={(e) => set({ customer_phone: e.target.value })} placeholder="09xx xxx xxx" />
            </Field>
          </div>
          {!isGift && (
            <Field label="Địa chỉ giao">
              <input value={f.address} onChange={(e) => set({ address: e.target.value })} placeholder="Số nhà, đường, phường…" />
            </Field>
          )}
        </section>

        {isGift && (
          <section className="card stack">
            <h3>
              <Icon name="gift" size={18} className="text-pink" /> Người nhận
            </h3>
            <p className="hint">Thông tin người nhận chỉ lưu trên đơn này — không thêm vào danh sách Khách hàng.</p>
            <div className="grid-2">
              <Field label="Họ tên" required className={errors.recipient_name ? 'has-error' : ''}>
                <input value={f.recipient_name} onChange={(e) => set({ recipient_name: e.target.value })} />
                {err('recipient_name')}
              </Field>
              <Field label="Số điện thoại">
                <input type="tel" inputMode="tel" value={f.recipient_phone} onChange={(e) => set({ recipient_phone: e.target.value })} />
              </Field>
            </div>
            <Field label="Địa chỉ">
              <input value={f.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
          </section>
        )}

        {/* Giao hàng */}
        <section className="card stack">
          <h3>Giao hàng</h3>
          <div className="grid-3">
            <Field label="Ngày giao" required className={errors.delivery_date ? 'has-error' : ''}>
              <input type="date" value={f.delivery_date} onChange={(e) => set({ delivery_date: e.target.value })} />
              {err('delivery_date')}
            </Field>
            <Field label="Giờ giao" hint="Để trống nếu không cố định">
              <input type="time" value={f.delivery_time} onChange={(e) => set({ delivery_time: e.target.value })} />
            </Field>
            <Field label="Nền tảng khách đặt">
              <select value={f.platform} onChange={(e) => set({ platform: e.target.value })}>
                <option value="">— Chọn —</option>
                {PLATFORMS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* Sản phẩm */}
        <section className="card stack">
          <h3>Mẫu hoa</h3>
          <p className="hint">Tìm và chọn — có thể thêm nhiều mẫu, tự cộng vào giá.</p>
          <FlowerPicker flowers={flowers.data || []} onPick={addFlower} onCreated={(fl) => flowers.setData([...(flowers.data || []), fl])} />
          {f.items.length > 0 && (
            <ul className="items">
              {f.items.map((it, k) => (
                <li key={k} className="item-row">
                  <span className="thumb-sm">{it.image_url ? <img src={small(it.image_url)} alt="" /> : <Icon name="flower" size={16} />}</span>
                  <div className="item-info">
                    <b>{it.name}</b>
                    <MoneyInput value={it.unit_price} onChange={(v) => updateItem(k, { unit_price: v })} aria-label={`Đơn giá ${it.name}`} />
                  </div>
                  <div className="stepper">
                    <button type="button" onClick={() => (it.qty > 1 ? updateItem(k, { qty: it.qty - 1 }) : setItems(f.items.filter((_, j) => j !== k)))} aria-label="Giảm">
                      <Icon name={it.qty > 1 ? 'minus' : 'trash'} size={16} />
                    </button>
                    <span>{it.qty}</span>
                    <button type="button" onClick={() => updateItem(k, { qty: it.qty + 1 })} aria-label="Tăng">
                      <Icon name="plus" size={16} />
                    </button>
                  </div>
                  <b className="item-total">{vnd(it.unit_price * it.qty)}</b>
                </li>
              ))}
            </ul>
          )}
          <Field label="Mô tả hoa" required className={errors.product_summary ? 'has-error' : ''}>
            <textarea rows={2} value={f.product_summary} onChange={(e) => set({ product_summary: e.target.value })} placeholder="VD: 4 bó hồng đỏ, giấy gói hồng pastel" />
            {err('product_summary')}
          </Field>
        </section>

        {/* Thanh toán */}
        <section className="card stack">
          <h3>Thanh toán</h3>
          <div className="grid-2">
            <Field label="Giá (VNĐ)" required hint={f.items.length ? 'Tự cộng từ mẫu hoa, có thể sửa' : ''}>
              <MoneyInput value={f.price} onChange={(v) => set({ price: v })} />
            </Field>
            <Field label="Tiền ship" hint="Ứng vận chuyển">
              <MoneyInput value={f.ship_fee} onChange={(v) => set({ ship_fee: v })} />
            </Field>
            <Field label="Chiết khấu" hint={f.discount_type === 'percent' ? 'Giảm theo % tiền hoa' : 'Giảm cho khách (VNĐ)'}>
              <div className="row gap-sm">
                <MoneyInput value={f.discount} onChange={(v) => set({ discount: f.discount_type === 'percent' ? Math.min(100, v) : v })} suffix="" />
                <Segmented
                  small
                  options={[
                    ['vnd', 'đ'],
                    ['percent', '%'],
                  ]}
                  value={f.discount_type}
                  onChange={(v) => set({ discount_type: v, discount: v === 'percent' ? Math.min(100, f.discount) : f.discount })}
                />
              </div>
            </Field>
            <Field label="Chi phí phát sinh" hint="Tiền cộng thêm khi khách yêu cầu thay đổi (vd: tăng size)">
              <MoneyInput value={f.extra_cost} onChange={(v) => set({ extra_cost: v })} />
            </Field>
          </div>
          <div className="sub-card stack">
            <b>Tiền cọc</b>
            <Segmented options={Object.entries(DEPOSIT)} value={f.deposit_status} onChange={(v) => set({ deposit_status: v })} />
            {f.deposit_status === 'partial' && (
              <Field label="Số tiền đã cọc" hint="Phần còn lại khách trả khi nhận / giao">
                <MoneyInput value={f.deposit_amount} onChange={(v) => set({ deposit_amount: v })} />
              </Field>
            )}
          </div>
        </section>

        {/* Ảnh */}
        <section className="card stack">
          <h3>Ảnh đơn</h3>
          <ImageDrop images={images} max={MAX_IMAGES} onAdd={addBlobs} onRemove={removeImage} pasteTarget={!aiOpen} />
        </section>

        {/* Cơ sở */}
        <section className="card stack">
          <h3>Cơ sở & nhân viên</h3>
          <div className="grid-2">
            <Field label="Tên cơ sở" hint={branches.data?.length === 0 ? 'Chưa có danh sách — thêm ở mục Nhân sự' : 'Chọn trước để lọc nhân viên'}>
              <select value={f.branch_id} onChange={(e) => set({ branch_id: e.target.value ? Number(e.target.value) : '', staff_id: '' })}>
                <option value="">— Chọn cơ sở —</option>
                {(branches.data || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="NV gói hoa" hint={!f.branch_id ? 'Chọn cơ sở trước' : staffList.length === 0 ? 'Cơ sở chưa có nhân viên' : ''}>
              <select value={f.staff_id} onChange={(e) => set({ staff_id: e.target.value ? Number(e.target.value) : '' })} disabled={!f.branch_id}>
                <option value="">— Chọn nhân viên —</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {branches.data?.length === 0 && (
            <Link to="/staff" className="link small">
              Thêm cơ sở / nhân viên →
            </Link>
          )}
        </section>

        <section className="card stack">
          <Field label="Ghi chú" hint="Lời nhắn thiệp, yêu cầu đặc biệt…">
            <textarea rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })} />
          </Field>
        </section>

        <section className="card stack">
          <h3>Chi tiết thanh toán</h3>
          <PaymentSummary order={f} />
        </section>

        <div className="action-bar">
          {(!id || isDraft) && (
            <button type="button" className="btn btn-ghost" onClick={() => save(true)} disabled={saving}>
              Lưu nháp
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Đang lưu…' : id && !isDraft ? 'Lưu thay đổi' : 'Tạo đơn'}
          </button>
        </div>
      </form>

      {aiOpen && <AiModal onClose={() => setAiOpen(false)} onFill={applyAi} />}
      {pickCustomer && (
        <CustomerPicker
          onClose={() => setPickCustomer(false)}
          onPick={(c) => {
            set({ customer_id: c.id, customer_name: c.name, customer_phone: c.phone || '', ...(f.order_for === 'self' && c.address ? { address: c.address } : {}) });
            setPickCustomer(false);
          }}
        />
      )}
    </div>
  );
}
