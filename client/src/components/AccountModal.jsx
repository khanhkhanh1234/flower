import { useState } from 'react';
import { api } from '../api.js';
import { useUser } from '../App.jsx';
import { Field, Modal, useLoad, useToast } from './ui.jsx';

export default function AccountModal({ onClose }) {
  const user = useUser();
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const settings = useLoad(() => api('/settings'), []);
  const [model, setModel] = useState('');

  const changePw = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/auth/password', { method: 'POST', body: pw });
      toast('Đã đổi mật khẩu');
      setPw({ current: '', next: '' });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveAi = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {};
      if (key) body.gemini_api_key = key.trim();
      if (model) body.gemini_model = model.trim();
      await api('/settings', { method: 'PUT', body });
      toast('Đã lưu cài đặt AI');
      setKey('');
      settings.reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    await api('/settings', { method: 'PUT', body: { gemini_api_key: '' } });
    toast('Đã xóa API key');
    settings.reload();
  };

  return (
    <Modal title="Tài khoản & cài đặt" onClose={onClose}>
      <p className="muted">
        Đăng nhập: <b>{user.email}</b> ({user.role === 'owner' ? 'Chủ tiệm' : 'Nhân viên'})
      </p>
      <form className="card stack" onSubmit={changePw}>
        <h3>Đổi mật khẩu</h3>
        <Field label="Mật khẩu hiện tại">
          <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
        </Field>
        <Field label="Mật khẩu mới" hint="Tối thiểu 8 ký tự">
          <input type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          Đổi mật khẩu
        </button>
      </form>
      {user.role === 'owner' && settings.data && (
        <form className="card stack" onSubmit={saveAi}>
          <h3>AI đọc tin nhắn (Google Gemini)</h3>
          <p className="muted small">
            Trạng thái:{' '}
            {settings.data.ai_configured ? <b className="text-ok">Đã cấu hình</b> : <b>Chưa có key — đang dùng bộ đọc cơ bản (chỉ đọc chữ)</b>}
            . Lấy key miễn phí tại aistudio.google.com.
          </p>
          <Field label="Gemini API key">
            <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={settings.data.ai_configured ? '•••••••• (để trống nếu giữ nguyên)' : 'AIza…'} />
          </Field>
          <Field label="Model">
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={settings.data.gemini_model} />
          </Field>
          <div className="row gap">
            <button className="btn btn-primary" disabled={busy || (!key && !model)}>
              Lưu
            </button>
            {settings.data.ai_configured && (
              <button type="button" className="btn btn-ghost" onClick={removeKey}>
                Xóa key
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
