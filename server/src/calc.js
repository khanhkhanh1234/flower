// Order money calculations (mirrored in client/src/calc.js).

export const money = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e12) : 0;
};

export function calcTotals(o) {
  const price = money(o.price);
  const ship = money(o.ship_fee);
  const extra = money(o.extra_cost);
  const discount =
    o.discount_type === 'percent'
      ? Math.round((price * Math.min(100, money(o.discount))) / 100)
      : money(o.discount);
  const total = Math.max(0, price + ship + extra - discount);
  const deposit =
    o.deposit_status === 'full' ? total : o.deposit_status === 'partial' ? Math.min(total, money(o.deposit_amount)) : 0;
  return {
    price,
    ship,
    extra,
    discount,
    total,
    deposit,
    remaining: Math.max(0, total - deposit),
    // Shipping is collected on behalf of the courier, so it's not revenue.
    revenue: Math.max(0, total - ship),
  };
}
