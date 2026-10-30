import { Component } from 'react';

let sent = 0;
/** Send a crash report to the server (phones have no dev tools). Never throws. */
export function reportError(kind, err) {
  if (++sent > 10) return;
  const body = JSON.stringify({
    kind,
    message: String(err?.message || err || ''),
    stack: String(err?.stack || ''),
    url: location.pathname + location.search,
  });
  fetch('/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

/** Show the error with a reload button instead of a blank screen. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportError('render', { message: error?.message, stack: `${error?.stack || ''}\n--- component:${info?.componentStack || ''}` });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page" style={{ padding: 24 }}>
        <div className="alert alert-error">
          <b>Ứng dụng gặp lỗi</b>
          <p className="small">Lỗi đã được gửi cho người quản lý. Bấm “Tải lại” để dùng tiếp.</p>
          <p className="small" style={{ wordBreak: 'break-word' }}>{String(this.state.error?.message || this.state.error)}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          Tải lại
        </button>
      </div>
    );
  }
}
