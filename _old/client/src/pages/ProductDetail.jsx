import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatPrice } from '../api.js';
import { useCart } from '../cart.jsx';
import ProductImage from '../components/ProductImage.jsx';

export default function ProductDetail() {
  const { slug } = useParams();
  const { add } = useCart();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setProduct(null);
    setError('');
    api(`/products/${encodeURIComponent(slug)}`)
      .then(setProduct)
      .catch((e) => setError(e.message));
  }, [slug]);

  if (error) {
    return (
      <div className="empty">
        <p className="error">{error}</p>
        <Link to="/">← Quay lại cửa hàng</Link>
      </div>
    );
  }
  if (!product) return <p className="muted">Đang tải...</p>;

  const soldOut = product.stock <= 0;
  const max = Math.min(product.stock, 99);

  return (
    <div className="detail">
      <ProductImage product={product} className="detail-image" />
      <div className="detail-info">
        <Link to="/" className="muted small">
          ← Tất cả sản phẩm
        </Link>
        <h1>{product.name}</h1>
        {product.category_name && <div className="muted">{product.category_name}</div>}
        <div className="price large">{formatPrice(product.price)}</div>
        <p className="description">{product.description}</p>
        <p className="muted small">{soldOut ? 'Hết hàng' : `Còn ${product.stock} sản phẩm`}</p>

        {!soldOut && (
          <div className="add-row">
            <div className="qty">
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Giảm">
                −
              </button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity((q) => Math.min(max, q + 1))} aria-label="Tăng">
                +
              </button>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                add(product, quantity);
                setAdded(true);
              }}
            >
              Thêm vào giỏ
            </button>
          </div>
        )}
        {added && (
          <p className="success">
            Đã thêm vào giỏ. <Link to="/gio-hang">Xem giỏ hàng →</Link>
          </p>
        )}
      </div>
    </div>
  );
}
