import { Link, useLocation, useParams } from 'react-router-dom';
import { formatPrice } from '../api.js';

export default function OrderSuccess() {
  const { id } = useParams();
  const { state } = useLocation();
  return (
    <div className="empty">
      <h1>🎉 Đặt hàng thành công!</h1>
      <p>
        Mã đơn hàng: <strong>#{id}</strong>
      </p>
      {state?.total != null && (
        <p>
          Tổng thanh toán khi nhận hàng: <strong>{formatPrice(state.total)}</strong>
        </p>
      )}
      <p className="muted">Chúng tôi sẽ gọi điện xác nhận đơn trong thời gian sớm nhất.</p>
      <Link to="/" className="btn btn-primary">
        Tiếp tục mua sắm
      </Link>
    </div>
  );
}
