const PALETTE = ['#fde2e4', '#fff1c1', '#e2f0cb', '#dbe7ff', '#f1dcff', '#ffe5d0'];
const ICONS = ['🌹', '🌻', '🌷', '💐', '🌸', '🌼'];

export default function ProductImage({ product, className = '' }) {
  if (product.image_url) {
    return <img className={`product-image ${className}`} src={product.image_url} alt={product.name} loading="lazy" />;
  }
  const i = product.id % PALETTE.length;
  return (
    <div className={`product-image placeholder ${className}`} style={{ background: PALETTE[i] }} aria-label={product.name}>
      <span>{ICONS[i]}</span>
    </div>
  );
}
