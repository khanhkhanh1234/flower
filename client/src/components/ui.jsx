import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import { STATUS, num, parseNum } from '../format.js';

// ---------- data loading ----------
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const seq = useRef(0);
  const reload = useCallback(() => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: '' }));
    fn()
      .then((data) => n === seq.current && setState({ data, error: '', loading: false }))
      .catch((e) => n === seq.current && setState((s) => ({ ...s, error: e.message, loading: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(reload, [reload]);
  // Phones keep tabs open for hours: refresh when the app comes back to the foreground.
  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [reload]);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((text, type = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Icon name={t.type === 'error' ? 'x' : 'check'} size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- modal ----------
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function confirmAsk(msg) {
  return window.confirm(msg);
}

// ---------- form bits ----------
export function Field({ label, required, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      {label && (
        <span className="field-label">
          {label}
          {required && <b className="req"> *</b>}
        </span>
      )}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function MoneyInput({ value, onChange, suffix = 'đ', ...rest }) {
  return (
    <div className="input-suffix">
      <input
        inputMode="numeric"
        value={num(value)}
        onChange={(e) => onChange(parseNum(e.target.value))}
        placeholder="0"
        {...rest}
      />
      {suffix && <span>{suffix}</span>}
    </div>
  );
}

export function Segmented({ options, value, onChange, small }) {
  return (
    <div className={`segmented ${small ? 'segmented-sm' : ''}`} role="radiogroup">
      {options.map(([v, label]) => (
        <button
          type="button"
          key={v}
          role="radio"
          aria-checked={value === v}
          className={value === v ? 'active' : ''}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function StatusPill({ status }) {
  return <span className={`pill pill-${status}`}>{STATUS[status]?.label || status}</span>;
}

export function Empty({ icon = 'flower', title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={30} />
      </div>
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

export function Loading() {
  return <div className="loading">Đang tải…</div>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error">
      {error}
      {onRetry && (
        <button type="button" className="link" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Tìm kiếm…' }) {
  return (
    <div className="search">
      <Icon name="search" size={18} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

/** Debounced value */
export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
