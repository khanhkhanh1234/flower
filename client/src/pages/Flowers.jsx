import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, uploadImage } from '../api.js';
import Icon from '../icons.jsx';
import { vnd } from '../format.js';
import { compressImage, small } from '../image.js';
import { fold } from '../components/pickers.jsx';
import { Empty, ErrorBox, Field, Loading, Modal, MoneyInput, SearchInput, confirmAsk, useLoad, useToast } from '../components/ui.jsx';

function FlowerModal({ id, onClose, onSaved }) {
  const toast = useToast();
  const existing = useLoad(() => (id ? api(`/flowers/${id}`) : Promise.resolve(null)), [id]);
  const [f, setF] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const v = f ?? existing.data ?? { name: '', price: 0, description: '' };
  const set = (patch) => setF({ ...v, ...patch });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let saved = id ? await api(`/flowers/${id}`, { method: 'PUT', body: v }) : await api('/flowers', { method: 'POST', body: v });
      if (file) saved = await uploadImage(`/flowers/${saved.id}/image`, await compressImage(file, 1200));
      toast(id ? 'Đã lưu mẫu hoa' : 'Đã thêm mẫu hoa');
      onSaved(saved);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirmAsk(`Xóa mẫu "${v.name}"? Các đơn cũ không bị ảnh hưởng.`)) return;
    await api(`/flowers/${id}`, { method: 'DELETE' });
    toast('Đã xóa mẫu hoa');
    onSaved(null);
  };

  const preview = file ? URL.createObjectURL(file) : v.image_url;
  return (
    <Modal title={id ? 'Mẫu hoa' : 'Thêm mẫu hoa'} onClose={onClose}>
      {id && existing.loading && !existing.data ? (
        <Loading />
      ) : (
        <form className="stack" onSubmit={save}>
          <label className="flower-img-pick">
            {preview ? <img src={preview} alt="" /> : <Icon name="image" size={30} />}
            <span>{preview ? 'Đổi ảnh' : 'Chọn ảnh mẫu'}</span>
            <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
          <Field label="Tên mẫu" required>
            <input value={v.name} onChange={(e) => set({ name: e.target.value })} required autoFocus={!id} />
          </Field>
          <Field label="Giá bán (mỗi bó)">
            <MoneyInput value={v.price} onChange={(p) => set({ price: p })} />
          </Field>
          <Field label="Mô tả">
            <textarea rows={3} value={v.description || ''} onChange={(e) => set({ description: e.target.value })} placeholder="Thành phần, kích thước, giấy gói…" />
          </Field>
          {existing.data?.stats && (
            <p className="muted small">
              Đã bán {existing.data.stats.qty} bó trong {existing.data.stats.orders} đơn.
            </p>
          )}
          <div className="row gap">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu'}
            </button>
            {id && (
              <button type="button" className="btn btn-danger-ghost ml-auto" onClick={remove}>
                Xóa mẫu
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function Flowers() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const list = useLoad(() => api('/flowers'), []);
  const editId = params.get('id');
  const adding = params.get('new') === '1';
  const close = () => setParams({}, { replace: true });

  const shown = (list.data || []).filter((f) => !q || fold(f.name).includes(fold(q)));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Mẫu hoa</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setParams({ new: '1' })}>
          <Icon name="plus" size={16} /> Thêm mẫu
        </button>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Tìm mẫu hoa…" />
      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <Loading />
      ) : shown.length ? (
        <div className="flower-grid">
          {shown.map((f) => (
            <button type="button" key={f.id} className="flower-card" onClick={() => setParams({ id: String(f.id) })}>
              <div className="flower-img">{f.image_url ? <img src={small(f.image_url)} alt="" loading="lazy" /> : <Icon name="flower" size={34} />}</div>
              <b>{f.name}</b>
              <span className="text-pink">{vnd(f.price)}</span>
            </button>
          ))}
        </div>
      ) : (
        <Empty icon="flower" title={q ? 'Không tìm thấy mẫu' : 'Chưa có mẫu hoa'}>
          <button type="button" className="btn btn-primary" onClick={() => setParams({ new: '1' })}>
            <Icon name="plus" size={18} /> Thêm mẫu đầu tiên
          </button>
        </Empty>
      )}
      {(editId || adding) && (
        <FlowerModal
          key={editId || 'new'}
          id={editId}
          onClose={close}
          onSaved={() => {
            close();
            list.reload();
          }}
        />
      )}
    </div>
  );
}
