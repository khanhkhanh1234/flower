import { useState } from 'react';
import { api } from '../api.js';
import { useUser } from '../App.jsx';
import Icon from '../icons.jsx';
import { fmtDateTime } from '../format.js';
import { ErrorBox, Field, Loading, Modal, confirmAsk, useLoad, useToast } from '../components/ui.jsx';

export default function Staff() {
  const user = useUser();
  const toast = useToast();
  const branches = useLoad(() => api('/branches'), []);
  const staff = useLoad(() => api('/staff'), []);
  const users = useLoad(() => (user.role === 'owner' ? api('/users') : Promise.resolve([])), [user.role]);
  const [edit, setEdit] = useState(null); // {type:'branch'|'staff'|'user', data}

  const del = async (type, item) => {
    const label = type === 'branch' ? `cơ sở "${item.name}"` : type === 'staff' ? `nhân viên "${item.name}"` : `tài khoản ${item.email}`;
    if (!confirmAsk(`Xóa ${label}?`)) return;
    try {
      await api(`/${type === 'branch' ? 'branches' : type === 'staff' ? 'staff' : 'users'}/${item.id}`, { method: 'DELETE' });
      toast('Đã xóa');
      branches.reload();
      staff.reload();
      users.reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Nhân sự</h1>
      </div>

      <section className="card stack">
        <div className="card-head">
          <h3>Cơ sở</h3>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => setEdit({ type: 'branch', data: {} })}>
            <Icon name="plus" size={16} /> Thêm cơ sở
          </button>
        </div>
        <ErrorBox error={branches.error} />
        {branches.loading && !branches.data ? (
          <Loading />
        ) : branches.data?.length ? (
          <ul className="list">
            {branches.data.map((b) => (
              <li key={b.id} className="list-item">
                <span className="grow">
                  <b>{b.name}</b>
                  {b.address && <span className="muted small">{b.address}</span>}
                </span>
                <span className="muted small">{(staff.data || []).filter((s) => s.branch_id === b.id).length} NV</span>
                <button type="button" className="icon-btn" onClick={() => setEdit({ type: 'branch', data: b })} aria-label="Sửa">
                  <Icon name="edit" size={18} />
                </button>
                <button type="button" className="icon-btn" onClick={() => del('branch', b)} aria-label="Xóa">
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Chưa có cơ sở nào.</p>
        )}
      </section>

      <section className="card stack">
        <div className="card-head">
          <h3>Nhân viên gói hoa</h3>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => setEdit({ type: 'staff', data: {} })}>
            <Icon name="plus" size={16} /> Thêm nhân viên
          </button>
        </div>
        {staff.loading && !staff.data ? (
          <Loading />
        ) : staff.data?.length ? (
          <ul className="list">
            {staff.data.map((s) => (
              <li key={s.id} className="list-item">
                <span className="avatar">{s.name.trim().charAt(0).toUpperCase()}</span>
                <span className="grow">
                  <b>{s.name}</b>
                  <span className="muted small">
                    {s.branch_name || 'Chưa gán cơ sở'}
                    {s.phone && ` · ${s.phone}`}
                  </span>
                </span>
                <button type="button" className="icon-btn" onClick={() => setEdit({ type: 'staff', data: s })} aria-label="Sửa">
                  <Icon name="edit" size={18} />
                </button>
                <button type="button" className="icon-btn" onClick={() => del('staff', s)} aria-label="Xóa">
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Chưa có nhân viên nào.</p>
        )}
      </section>

      {user.role === 'owner' && (
        <section className="card stack">
          <div className="card-head">
            <h3>Tài khoản đăng nhập</h3>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setEdit({ type: 'user', data: {} })}>
              <Icon name="plus" size={16} /> Thêm tài khoản
            </button>
          </div>
          <p className="hint">Cho nhân viên đăng nhập để tạo và cập nhật đơn. Chỉ chủ tiệm được đổi cài đặt AI.</p>
          <ul className="list">
            {(users.data || []).map((u) => (
              <li key={u.id} className="list-item">
                <span className="grow">
                  <b>{u.email}</b>
                  <span className="muted small">
                    {u.role === 'owner' ? 'Chủ tiệm' : 'Nhân viên'} · tạo {fmtDateTime(u.created_at)}
                  </span>
                </span>
                {u.role !== 'owner' && (
                  <button type="button" className="icon-btn" onClick={() => del('user', u)} aria-label="Xóa">
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {edit && (
        <EditModal
          {...edit}
          branches={branches.data || []}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            branches.reload();
            staff.reload();
            users.reload();
          }}
        />
      )}
    </div>
  );
}

function EditModal({ type, data, branches, onClose, onSaved }) {
  const [v, setV] = useState({ name: '', address: '', phone: '', branch_id: '', email: '', password: '', ...data });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const path = type === 'branch' ? '/branches' : type === 'staff' ? '/staff' : '/users';
  const title = { branch: 'cơ sở', staff: 'nhân viên', user: 'tài khoản' }[type];

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = type === 'staff' ? { ...v, branch_id: v.branch_id || null } : v;
      await api(v.id ? `${path}/${v.id}` : path, { method: v.id ? 'PUT' : 'POST', body });
      toast('Đã lưu');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${v.id ? 'Sửa' : 'Thêm'} ${title}`} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {type === 'user' ? (
          <>
            <Field label="Email" required>
              <input type="email" autoComplete="off" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required autoFocus />
            </Field>
            <Field label="Mật khẩu" required hint="Tối thiểu 8 ký tự">
              <input type="password" autoComplete="new-password" minLength={8} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} required />
            </Field>
          </>
        ) : (
          <>
            <Field label={type === 'branch' ? 'Tên cơ sở' : 'Tên nhân viên'} required>
              <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required autoFocus />
            </Field>
            {type === 'branch' ? (
              <Field label="Địa chỉ">
                <input value={v.address || ''} onChange={(e) => setV({ ...v, address: e.target.value })} />
              </Field>
            ) : (
              <>
                <Field label="Số điện thoại">
                  <input type="tel" value={v.phone || ''} onChange={(e) => setV({ ...v, phone: e.target.value })} />
                </Field>
                <Field label="Cơ sở">
                  <select value={v.branch_id || ''} onChange={(e) => setV({ ...v, branch_id: e.target.value ? Number(e.target.value) : '' })}>
                    <option value="">— Chọn cơ sở —</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </>
        )}
        <button className="btn btn-primary" disabled={busy}>
          Lưu
        </button>
      </form>
    </Modal>
  );
}
