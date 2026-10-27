import { Link, NavLink, Outlet } from 'react-router-dom';
import { useCart } from '../cart.jsx';

export default function Layout() {
  const { count } = useCart();
  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="logo">
            🌸 Tiệm Hoa
          </Link>
          <nav className="nav">
            <NavLink to="/" end>
              Sản phẩm
            </NavLink>
            <NavLink to="/gio-hang" className="cart-link">
              Giỏ hàng {count > 0 && <span className="badge">{count}</span>}
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="container main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container">© {new Date().getFullYear()} Tiệm Hoa · Giao hoa tận nơi</div>
      </footer>
    </>
  );
}
