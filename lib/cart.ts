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
  // Stock ceiling captured when the item was added/last refreshed — used to cap quantity client
  // side so a customer can't stack more in their bag than actually exists. Optional only for
  // backward compatibility with carts saved before this field existed; falls back to a
  // conservative cap of 10 when absent. The cart/checkout pages re-check this against the live
  // database via /api/cart-availability, since stock can change after an item was added.
  available?: number;
};

const KEY = "muse-and-silk-cart";
const FALLBACK_MAX = 10;

function capFor(item: Pick<CartItem, "available">): number {
  return typeof item.available === "number" ? item.available : FALLBACK_MAX;
}

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
  if (existing) {
    existing.available = item.available ?? existing.available;
    existing.quantity = Math.min(capFor(existing), existing.quantity + item.quantity);
  } else {
    items.push({ ...item, quantity: Math.min(capFor(item), item.quantity) });
  }
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
  item.quantity = Math.min(capFor(item), quantity);
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
