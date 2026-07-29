export type CartItem = {
  variantId: string;
  productId?: string;
  slug: string;
  name: string;
  variantName: string;
  sku: string;
  price: number;
  quantity: number;
  imageUrl?: string;
};

const KEY = "muse-and-silk-cart";

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("muse-cart-change", { detail: items }));
}

export function addCartItem(item: CartItem) {
  const items = readCart();
  const existing = items.find((entry) => entry.variantId === item.variantId);
  if (existing) existing.quantity = Math.min(10, existing.quantity + item.quantity);
  else items.push(item);
  writeCart(items);
}

export function removeCartItem(variantId: string) {
  writeCart(readCart().filter((item) => item.variantId !== variantId));
}

export function updateCartItemQuantity(variantId: string, quantity: number) {
  const items = readCart();
  const item = items.find((entry) => entry.variantId === variantId);
  if (!item) return;
  if (quantity <= 0) {
    writeCart(items.filter((entry) => entry.variantId !== variantId));
    return;
  }
  item.quantity = Math.min(10, quantity);
  writeCart(items);
}

export function clearCart() {
  writeCart([]);
}

export function cartCount(items = readCart()) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function cartSubtotal(items = readCart()) {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
}
