import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api.js';
import Icon, { Logo } from './icons.jsx';
import { Loading, useToast } from './components/ui.jsx';
import AccountModal from './components/AccountModal.jsx';
import Login from './pages/Login.jsx';
import Today from './pages/Today.jsx';
import Orders from './pages/Orders.jsx';
import OrderForm from './pages/OrderForm.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Drafts from './pages/Drafts.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Flowers from './pages/Flowers.jsx';
import Staff from './pages/Staff.jsx';
import Reports from './pages/Reports.jsx';
import Trash from './pages/Trash.jsx';

const UserCtx = createContext(null);
export const useUser = () => useContext(UserCtx);

const NAV = [
  ['/', 'today', 'Hôm nay'],
  ['/orders', 'orders', 'Đơn hàng'],
  ['/drafts', 'draft', 'Đơn nháp'],
  ['/customers', 'users', 'Khách'],
  ['/flowers', 'flower', 'Mẫu hoa'],
  ['/staff', 'staff', 'Nhân sự'],
  ['/reports', 'chart', 'Báo cáo'],
  ['/trash', 'trash', 'Rác'],
];

export default function App() {
  const [auth, setAuth] = useState({ loading: true, user: null, needsSetup: false });
  const [account, setAccount] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { user } = await api('/auth/me');
        if (alive) setAuth({ loading: false, user, needsSetup: false });
      } catch {
        const st = await api('/auth/state').catch(() => ({ needsSetup: false }));
        if (alive) setAuth({ loading: false, user: null, needsSetup: st.needsSetup });
      }
    })();
    const onUnauth = () => setAuth((a) => ({ ...a, user: null }));
    window.addEventListener('fm:unauthorized', onUnauth);
    return () => {
      alive = false;
      window.removeEventListener('fm:unauthorized', onUnauth);
    };
  }, []);

  if (auth.loading) return <Loading />;
  if (!auth.user)
    return <Login needsSetup={auth.needsSetup} onDone={(user) => setAuth({ loading: false, user, needsSetup: false })} />;

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setAuth({ loading: false, user: null, needsSetup: false });
    toast('Đã đăng xuất');
  };

  return (
    <UserCtx.Provider value={auth.user}>
      <div className="app">
        <header className="topbar">
          <NavLink to="/" className="brand">
            <Logo />
            <span>Floral Muse</span>
          </NavLink>
          <div className="topbar-right">
            <span className="user-email">{auth.user.email}</span>
            <button type="button" className="icon-btn" onClick={() => setAccount(true)} aria-label="Tài khoản & cài đặt" title="Tài khoản & cài đặt">
              <Icon name="key" />
            </button>
            <button type="button" className="icon-btn" onClick={logout} aria-label="Đăng xuất" title="Đăng xuất">
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <nav className="nav" aria-label="Điều hướng chính">
          {NAV.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className="nav-item">
              <Icon name={icon} size={22} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/new" element={<OrderForm />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/orders/:id/edit" element={<OrderForm />} />
            <Route path="/drafts" element={<Drafts />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/flowers" element={<Flowers />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/trash" element={<Trash />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {account && <AccountModal onClose={() => setAccount(false)} />}
      </div>
    </UserCtx.Provider>
  );
}
