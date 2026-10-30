import { useState } from 'react';
import { api } from '../api.js';
import { Field } from '../components/ui.jsx';

export default function Login({ needsSetup, onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api(needsSetup ? '/auth/setup' : '/auth/login', { method: 'POST', body: { email, password } });
      onDone(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src="/logo.png" width="500" height="370" alt="Tamellia — Flower's shop by Tamquynh" />
          <p>{needsSetup ? 'Tạo tài khoản chủ tiệm để bắt đầu' : 'Đăng nhập để quản lý đơn hoa'}</p>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Email" required>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Mật khẩu" required hint={needsSetup ? 'Tối thiểu 8 ký tự' : ''}>
          <input
            type="password"
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={needsSetup ? 8 : undefined}
            required
          />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Đang xử lý…' : needsSetup ? 'Tạo tài khoản' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
