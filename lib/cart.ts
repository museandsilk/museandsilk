export type CartItem = {
  variantId: string;
  productId?: string;
  slug: string;
  name: string;
  variantName: string;
  sku: string;
  /** Price per unit as last seen (PKR). Display only – the server re-prices at checkout. */
  price: number;
  quantity: number;
  imageUrl?: string;
  // Stock ceiling captured when the item was added/last refreshed — used to cap quantity client
  // side so a customer can't stack more in their bag than actually exists. Optional only for
  // backward compatibility with carts saved before this field existed; falls back to a
  // conservative cap of 10 when absent. The cart/checkout pages re-check this against the live
  // database via /api/cart-availability, since stock can change after an item was added.
  available?: number;
  /** When the line was first added – lets forgotten carts expire (see CART_TTL_MS). */
  addedAt?: number;
};

const KEY = "nure-asmir-cart";
const FALLBACK_MAX = 10;
/** A bag that has sat untouched this long is dropped: stock, sizes and prices will have moved on. */
export const CART_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function capFor(item: Pick<CartItem, "available">): number {
  return typeof item.available === "number" ? item.available : FALLBACK_MAX;
}

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    const now = Date.now();
    const fresh = (value as CartItem[]).filter(
      (item) => item && typeof item.variantId === "string" && Number.isFinite(item.quantity) && item.quantity > 0 && (!item.addedAt || now - item.addedAt < CART_TTL_MS),
    );
    // Persist the pruning so the header count and cart page agree.
    if (fresh.length !== value.length) localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage full / blocked: the in-memory state still works for this page view.
  }
  window.dispatchEvent(new CustomEvent("na-cart-change", { detail: items }));
}

export function addCartItem(item: CartItem) {
  const items = readCart();
  const existing = items.find((entry) => entry.variantId === item.variantId);
  if (existing) {
    existing.available = item.available ?? existing.available;
    existing.price = item.price;
    existing.quantity = Math.min(capFor(existing), existing.quantity + item.quantity);
  } else {
    items.push({ ...item, addedAt: Date.now(), quantity: Math.min(capFor(item), item.quantity) });
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
