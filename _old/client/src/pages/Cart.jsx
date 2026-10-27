import { Link } from 'react-router-dom';
import { formatPrice } from '../api.js';
import { useCart } from '../cart.jsx';
import ProductImage from '../components/ProductImage.jsx';

export default function Cart() {
  const { items, setQuantity, remove, total } = useCart();

  if (items.length === 0) {
    return (
      <div className="empty">
        <h1>Giỏ hàng trống</h1>
        <Link to="/" className="btn btn-primary">
          Mua hoa ngay
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1>Giỏ hàng</h1>
      <div className="cart-list">
        {items.map((item) => (
          <div key={item.id} className="cart-item">
            <ProductImage product={item} className="thumb" />
            <div className="cart-item-info">
              <Link to={`/san-pham/${item.slug}`}>{item.name}</Link>
              <div className="muted small">{formatPrice(item.price)}</div>
            </div>
            <div className="qty">
              <button onClick={() => setQuantity(item.id, item.quantity - 1)} aria-label="Giảm">
                −
              </button>
              <span>{item.quantity}</span>
              <button onClick={() => setQuantity(item.id, item.quantity + 1)} aria-label="Tăng">
                +
              </button>
            </div>
            <div className="line-total">{formatPrice(item.price * item.quantity)}</div>
            <button className="link danger" onClick={() => remove(item.id)}>
              Xoá
            </button>
          </div>
        ))}
      </div>
      <div className="cart-summary">
        <div>
          Tạm tính: <strong>{formatPrice(total)}</strong>
        </div>
        <Link to="/thanh-toan" className="btn btn-primary">
          Đặt hàng
        </Link>
      </div>
    </>
  );
}
