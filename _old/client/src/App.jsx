import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import OrderSuccess from './pages/OrderSuccess.jsx';
import NotFound from './pages/NotFound.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="san-pham/:slug" element={<ProductDetail />} />
        <Route path="gio-hang" element={<Cart />} />
        <Route path="thanh-toan" element={<Checkout />} />
        <Route path="dat-hang-thanh-cong/:id" element={<OrderSuccess />} />
        <Route path="admin/login" element={<AdminLogin />} />
        <Route path="admin" element={<AdminDashboard />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
