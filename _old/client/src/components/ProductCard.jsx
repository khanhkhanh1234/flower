import { Link } from 'react-router-dom';
import { formatPrice } from '../api.js';
import { useCart } from '../cart.jsx';
import ProductImage from './ProductImage.jsx';

export default function ProductCard({ product }) {
  const { add } = useCart();
  const soldOut = product.stock <= 0;
  return (
    <article className="card">
      <Link to={`/san-pham/${product.slug}`}>
        <ProductImage product={product} />
      </Link>
      <div className="card-body">
        {product.category_name && <div className="muted small">{product.category_name}</div>}
        <Link to={`/san-pham/${product.slug}`} className="card-title">
          {product.name}
        </Link>
        <div className="price">{formatPrice(product.price)}</div>
        <button className="btn btn-primary" disabled={soldOut} onClick={() => add(product)}>
          {soldOut ? 'Hết hàng' : 'Thêm vào giỏ'}
        </button>
      </div>
    </article>
  );
}
