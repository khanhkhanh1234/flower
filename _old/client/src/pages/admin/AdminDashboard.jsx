import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { clearToken, getToken } from './token.js';
import ProductsAdmin from './ProductsAdmin.jsx';
import OrdersAdmin from './OrdersAdmin.jsx';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('orders');
  const token = getToken();

  const logout = useCallback(() => {
    clearToken();
    navigate('/admin/login', { replace: true });
  }, [navigate]);

  // API helper that logs out on expired/invalid token
  const adminApi = useCallback(
    async (path, options = {}) => {
      try {
        return await api(path, { ...options, token: getToken() });
      } catch (err) {
        if (err.status === 401) logout();
        throw err;
      }
    },
    [logout]
  );

  if (!token) return <Navigate to="/admin/login" replace />;

  return (
    <>
      <div className="admin-header">
        <h1>Quản trị</h1>
        <div className="tabs">
          <button className={`chip ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
            Đơn hàng
          </button>
          <button className={`chip ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>
            Sản phẩm
          </button>
          <button className="link" onClick={logout}>
            Đăng xuất
          </button>
        </div>
      </div>
      {tab === 'orders' ? <OrdersAdmin adminApi={adminApi} /> : <ProductsAdmin adminApi={adminApi} />}
    </>
  );
}
