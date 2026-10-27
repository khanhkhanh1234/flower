import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'cart';

function loadCart() {
  try {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo(() => {
    const add = (product, quantity = 1) =>
      setItems((prev) => {
        const existing = prev.find((i) => i.id === product.id);
        if (existing) {
          return prev.map((i) =>
            i.id === product.id ? { ...i, quantity: Math.min(i.quantity + quantity, 99) } : i
          );
        }
        const { id, name, slug, price, image_url } = product;
        return [...prev, { id, name, slug, price, image_url, quantity }];
      });

    const setQuantity = (id, quantity) =>
      setItems((prev) =>
        quantity <= 0
          ? prev.filter((i) => i.id !== id)
          : prev.map((i) => (i.id === id ? { ...i, quantity: Math.min(quantity, 99) } : i))
      );

    const remove = (id) => setItems((prev) => prev.filter((i) => i.id !== id));
    const clear = () => setItems([]);

    const count = items.reduce((s, i) => s + i.quantity, 0);
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

    return { items, add, setQuantity, remove, clear, count, total };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
