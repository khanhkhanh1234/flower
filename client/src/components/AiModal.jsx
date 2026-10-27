import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Icon from '../icons.jsx';
import { DEPOSIT, fmtDate, vnd } from '../format.js';
import { blobToDataURL, compressImage, imagesFromTransfer } from '../image.js';
import { Modal, useLoad, useToast } from './ui.jsx';

/** Chat-style modal: paste customer messages / screenshots, AI extracts an order draft. */
export default function AiModal({ onClose, onFill }) {
  const [msgs, setMsgs] = useState([]); // {role:'user', text, images[]} | {role:'ai', data, reply, warning, discarded}
  const [text, setText] = useState('');
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const toast = useToast();
  const settings = useLoad(() => api('/settings'), []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [msgs, busy]);

  const addFiles = async (files) => {
    const urls = [];
    for (const f of files.slice(0, 10 - pending.length)) urls.push(await blobToDataURL(await compressImage(f)));
    setPending((p) => [...p, ...urls]);
  };

  const send = async () => {
    if (busy || (!text.trim() && !pending.length)) return;
    const userMsg = { role: 'user', text: text.trim(), images: pending };
    const next = [...msgs, userMsg];
    setMsgs(next);
    setText('');
    setPending([]);
    setBusy(true);
    try {
      const messages = next.filter((m) => m.role === 'user').map(({ text: t, images }) => ({ text: t, images }));
      const r = await api('/ai/parse', { method: 'POST', body: { messages } });
      setMsgs((m) => [...m, { role: 'ai', ...r }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'ai', error: e.message }]);
    } finally {
      setBusy(false);
    }
  };

  const lastAi = [...msgs].reverse().find((m) => m.role === 'ai' && m.data);
  const result = lastAi && !lastAi.discarded ? lastAi.data : null;
  const allImages = msgs.filter((m) => m.role === 'user').flatMap((m) => m.images);

  const discard = () => setMsgs((m) => m.map((x) => (x === lastAi ? { ...x, discarded: true } : x)));
  const copy = async (s) => {
    try {
      await navigator.clipboard.writeText(s);
      toast('Đã sao chép tin nhắn');
    } catch {
      toast('Không sao chép được', 'error');
    }
  };

  return (
    <Modal
      title="Tạo đơn bằng AI"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn btn-primary" disabled={!result} onClick={() => onFill(result, allImages)}>
            <Icon name="check" size={18} /> Điền vào đơn
          </button>
        </>
      }
    >
      {settings.data && !settings.data.ai_configured && (
        <div className="alert alert-info small">
          Đang dùng bộ đọc cơ bản (chỉ đọc chữ). Chủ tiệm thêm Gemini API key ở biểu tượng chìa khóa để đọc được cả ảnh chụp màn hình.
        </div>
      )}
      <div
        className="chat"
        onPaste={(e) => {
          const files = imagesFromTransfer(e.clipboardData);
          if (files.length) {
            e.preventDefault();
            addFiles(files);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(imagesFromTransfer(e.dataTransfer));
        }}
      >
        {msgs.length === 0 && (
          <div className="chat-empty">
            <Icon name="sparkles" size={28} />
            <p>Dán tin nhắn của khách vào đây</p>
            <small>Có thể kèm ảnh chụp màn hình cuộc trò chuyện. AI sẽ đọc và điền sẵn đơn.</small>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="bubble bubble-user">
              {m.images.length > 0 && (
                <div className="bubble-imgs">
                  {m.images.map((src, j) => (
                    <img key={j} src={src} alt="" />
                  ))}
                </div>
              )}
              {m.text && <p>{m.text}</p>}
            </div>
          ) : (
            <div key={i} className="bubble bubble-ai">
              {m.error ? (
                <p className="text-error">{m.error}</p>
              ) : (
                <>
                  {m.warning && <p className="small text-warn">{m.warning}</p>}
                  <p>{m.reply}</p>
                  <button type="button" className="link small" onClick={() => copy(m.reply)}>
                    <Icon name="copy" size={14} /> Sao chép trả lời khách
                  </button>
                  {m === lastAi && !m.discarded && <AiResult d={m.data} onDiscard={discard} />}
                </>
              )}
            </div>
          ),
        )}
        {busy && <div className="bubble bubble-ai typing">AI đang đọc…</div>}
        <div ref={endRef} />
      </div>
      {pending.length > 0 && (
        <div className="thumbs">
          {pending.map((src, i) => (
            <div key={i} className="thumb">
              <img src={src} alt="" />
              <button type="button" className="thumb-x" onClick={() => setPending((p) => p.filter((_, j) => j !== i))} aria-label="Bỏ ảnh">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="chat-input">
        <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Đính kèm ảnh">
          <Icon name="clip" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...e.target.files]);
            e.target.value = '';
          }}
        />
        <textarea
          rows={2}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Dán tin nhắn… (Enter gửi, Shift+Enter xuống dòng)"
        />
        <button type="button" className="btn btn-primary" onClick={send} disabled={busy || (!text.trim() && !pending.length)} aria-label="Gửi">
          <Icon name="send" size={18} />
        </button>
      </div>
    </Modal>
  );
}

function AiResult({ d, onDiscard }) {
  const rows = [
    ['Người đặt', [d.customer_name, d.customer_phone].filter(Boolean).join(' · ')],
    d.order_for === 'gift' && ['Người nhận', [d.recipient_name, d.recipient_phone].filter(Boolean).join(' · ')],
    [d.order_for === 'gift' ? 'Địa chỉ người nhận' : 'Địa chỉ giao', d.address],
    ['Ngày giao', d.delivery_date ? `${fmtDate(d.delivery_date)} ${d.delivery_time}` : ''],
    ['Mô tả hoa', d.product_summary],
    ['Giá', d.price ? vnd(d.price) : ''],
    ['Tiền ship', d.ship_fee ? vnd(d.ship_fee) : ''],
    d.extra_cost && ['Phụ phí', vnd(d.extra_cost)],
    d.discount && ['Chiết khấu', d.discount_type === 'percent' ? `${d.discount}%` : vnd(d.discount)],
    ['Cọc', d.deposit_status !== 'none' ? `${DEPOSIT[d.deposit_status]} · ${vnd(d.deposit_amount)}` : ''],
    ['Lời nhắn', d.note],
  ].filter(Boolean);
  return (
    <div className="ai-result">
      <div className="ai-result-head">
        <b>Thông tin AI đọc được</b>
        <button type="button" className="link small" onClick={onDiscard}>
          Bỏ kết quả
        </button>
      </div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || <span className="muted">—</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
