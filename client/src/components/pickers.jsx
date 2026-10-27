import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Icon from '../icons.jsx';
import { vnd } from '../format.js';
import { compressImage, imagesFromTransfer } from '../image.js';
import { Loading, Modal, SearchInput, useDebounced, useLoad, useToast } from './ui.jsx';

export const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

/** Search-or-create combobox for flower models. */
export function FlowerPicker({ flowers, onPick, onCreated }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const toast = useToast();
  const box = useRef(null);

  const matches = useMemo(() => {
    const f = fold(q.trim());
    return flowers.filter((x) => !f || fold(x.name).includes(f)).slice(0, 8);
  }, [q, flowers]);
  const exact = flowers.some((x) => fold(x.name) === fold(q.trim()));
  const options = [...matches.map((f) => ({ f })), ...(q.trim() && !exact ? [{ create: q.trim() }] : [])];

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = async (opt) => {
    if (!opt) return;
    if (opt.f) onPick(opt.f);
    else {
      try {
        const f = await api('/flowers', { method: 'POST', body: { name: opt.create, price: 0 } });
        onCreated?.(f);
        onPick(f);
        toast(`Đã thêm mẫu "${f.name}" — nhập giá ở dòng bên dưới`);
      } catch (e) {
        toast(e.message, 'error');
        return;
      }
    }
    setQ('');
    setOpen(false);
  };

  return (
    <div className="combo" ref={box}>
      <div className="search">
        <Icon name="search" size={18} />
        <input
          value={q}
          placeholder="Tìm / thêm mẫu hoa…"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(options.length - 1, a + 1)));
            if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
            if (e.key === 'Enter') (e.preventDefault(), choose(options[active]));
            if (e.key === 'Escape') setOpen(false);
          }}
          role="combobox"
          aria-expanded={open}
          aria-label="Chọn mẫu hoa"
        />
      </div>
      {open && options.length > 0 && (
        <ul className="combo-list" role="listbox">
          {options.map((o, i) => (
            <li
              key={o.f ? o.f.id : 'new'}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => (e.preventDefault(), choose(o))}
            >
              {o.f ? (
                <>
                  <span className="thumb-sm">{o.f.image_url ? <img src={o.f.image_url} alt="" /> : <Icon name="flower" size={16} />}</span>
                  <span className="grow">{o.f.name}</span>
                  <span className="muted small">{vnd(o.f.price)}</span>
                </>
              ) : (
                <>
                  <span className="thumb-sm">
                    <Icon name="plus" size={16} />
                  </span>
                  <span className="grow">
                    Thêm mẫu mới “<b>{o.create}</b>”
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CustomerPicker({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const list = useLoad(() => api(`/customers?q=${encodeURIComponent(dq)}`), [dq]);
  return (
    <Modal title="Chọn khách cũ" onClose={onClose}>
      <SearchInput value={q} onChange={setQ} placeholder="Tìm tên hoặc SĐT…" />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data?.length ? (
        <ul className="pick-list">
          {list.data.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)}>
                <b>{c.name}</b>
                <span className="muted small">
                  {c.phone || 'Không có SĐT'} · {c.order_count} đơn
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted center">Không tìm thấy khách.</p>
      )}
    </Modal>
  );
}

/** Image dropzone: paste / drag / choose; compresses to 1600px JPEG. */
export function ImageDrop({ images, max = 10, onAdd, onRemove, pasteTarget = true }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const add = async (files) => {
    const room = max - images.length;
    if (!files.length) return;
    if (room <= 0) return toast(`Tối đa ${max} ảnh`, 'error');
    if (files.length > room) toast(`Chỉ thêm được ${room} ảnh nữa`, 'error');
    setBusy(true);
    try {
      const blobs = [];
      for (const f of files.slice(0, room)) blobs.push(await compressImage(f));
      onAdd(blobs);
    } catch {
      toast('Không đọc được ảnh', 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!pasteTarget) return;
    const onPaste = (e) => {
      const files = imagesFromTransfer(e.clipboardData);
      if (files.length) {
        e.preventDefault();
        add(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  return (
    <div>
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(imagesFromTransfer(e.dataTransfer));
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        <Icon name="image" size={26} />
        <span>{busy ? 'Đang nén ảnh…' : 'Paste / kéo thả / chọn ảnh'}</span>
        <small>
          Tối đa {max} · tự nén về 1600px · {images.length} đã chọn
        </small>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            add([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>
      {images.length > 0 && (
        <div className="thumbs">
          {images.map((img) => (
            <div key={img.key} className="thumb">
              <img src={img.url} alt="" />
              <button type="button" className="thumb-x" onClick={() => onRemove(img.key)} aria-label="Xóa ảnh">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
