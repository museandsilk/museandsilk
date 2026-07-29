"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { StoreHeader } from "@/app/(store)/_components/store-components";
import { clearCart, readCart, type CartItem } from "@/lib/cart";

type Zone = { id: string; name: string; deliveryCharge: number; estimatedDaysMin: number; estimatedDaysMax: number };
type Settings = {
  freeDeliveryThreshold: number;
  whatsappNumber: string;
  bankName: string;
  bankAccountTitle: string;
  bankAccountNumber: string;
  bankIban: string;
};
type Bank = { name: string; accountTitle: string; accountNumber: string; iban: string };
type OrderResult = {
  orderId: string;
  orderNumber: string;
  total: number;
  deliveryCharge: number;
  discount: number;
  reservationExpiresAt: string | null;
  paymentMethod: "cod" | "bank_deposit";
  whatsappNumber: string;
  bank?: Bank;
};
type CouponState = { code: string; discount: number; description: string } | null;

const money = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });

const PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu and Kashmir",
];

export default function CheckoutPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [zoneId, setZoneId] = useState("");
  const [payment, setPayment] = useState<"cod" | "bank_deposit">("cod");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OrderResult | null>(null);
  const [receiptMessage, setReceiptMessage] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponState>(null);
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  // Generated once per page load / checkout attempt. Reusing it across retries of the same submit
  // (network errors, double-clicks) lets the server treat a retry as the same order via
  // findOrderByIdempotencyKey instead of creating a duplicate.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const timer = window.setTimeout(() => setItems(readCart()), 0);
    fetch("/api/checkout/options")
      .then((response) => response.json())
      .then((data: { zones?: Zone[]; settings?: Settings | null }) => {
        setZones(data.zones ?? []);
        setSettings(data.settings ?? null);
        if (data.zones?.[0]) setZoneId(data.zones[0].id);
      })
      .catch(() => {
        setError("Delivery options could not be loaded. Please refresh and try again.");
      });
    return () => window.clearTimeout(timer);
  }, []);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);
  const zone = zones.find((item) => item.id === zoneId);
  const delivery = subtotal >= Number(settings?.freeDeliveryThreshold ?? 12000) ? 0 : Number(zone?.deliveryCharge ?? 0);
  const total = Math.max(0, subtotal + delivery - (coupon?.discount ?? 0));

  // Re-check the applied coupon whenever the cart total changes (e.g. a min-order-amount coupon
  // that was valid before a quantity change might no longer qualify).
  useEffect(() => {
    if (!coupon) return;
    void applyCoupon(coupon.code, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, delivery]);

  async function applyCoupon(code: string, silent = false) {
    if (!code.trim()) return;
    setCouponBusy(true);
    setCouponError("");
    try {
      const response = await fetch("/api/checkout/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal, deliveryCharge: delivery }),
      });
      const data = await response.json();
      if (!response.ok || !data.valid) {
        setCoupon(null);
        if (!silent) setCouponError(data.error ?? "This coupon isn't valid.");
        return;
      }
      setCoupon({ code: data.code, discount: data.discount, description: data.description });
    } catch {
      setCoupon(null);
      if (!silent) setCouponError("Could not check this coupon. Please try again.");
    } finally {
      setCouponBusy(false);
    }
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponInput("");
    setCouponError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          ...values,
          zoneId,
          paymentMethod: payment,
          couponCode: coupon?.code,
          items: items.map(({ variantId, quantity }) => ({ variantId, quantity })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "The order could not be placed.");
      } else {
        setResult(data as OrderResult);
        clearCart();
        setItems([]);
      }
    } catch {
      setError("The order could not be placed. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result) return;
    const form = new FormData(event.currentTarget);
    form.set("orderId", result.orderId);
    const response = await fetch("/api/orders/payment-proof", { method: "POST", body: form });
    const data = await response.json();
    setReceiptMessage(response.ok ? "Receipt received. We will verify it shortly." : data.error);
    if (response.ok) event.currentTarget.reset();
  }

  if (result) {
    const whatsappNumber = result.whatsappNumber;
    const whatsappMessage = encodeURIComponent(
      `Hi Muse & Silk, I've placed order ${result.orderNumber} (total ${money.format(result.total)}). Please confirm.`,
    );
    return (
      <main>
        <StoreHeader />
        <section className="order-success">
          <p className="eyebrow">Order received</p>
          <span className="success-mark">◇</span>
          <h1>
            Thank you.
            <br />
            Your pieces are reserved.
          </h1>
          <div>
            <span>Order number</span>
            <strong>{result.orderNumber}</strong>
            <button onClick={() => navigator.clipboard.writeText(result.orderNumber)}>Copy</button>
          </div>
          <p>
            Your reservation remains active until{" "}
            {result.reservationExpiresAt ? new Date(result.reservationExpiresAt).toLocaleString("en-PK") : "soon"}. We
            will confirm the order by phone or WhatsApp.
            {result.discount > 0 && <> Your coupon saved you {money.format(result.discount)}.</>}
          </p>
          {whatsappNumber && (
            <p>
              <a
                className="button button-dark"
                href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
                target="_blank"
                rel="noreferrer"
              >
                Message us on WhatsApp
              </a>
            </p>
          )}
          {result.paymentMethod === "bank_deposit" && result.bank && (
            <aside>
              <h2>Bank deposit details</h2>
              <p>{result.bank.name}</p>
              <p>{result.bank.accountTitle}</p>
              <p>{result.bank.accountNumber}</p>
              <p>{result.bank.iban}</p>
              <form className="receipt-upload" onSubmit={uploadReceipt}>
                <label>
                  <span>Upload payment receipt</span>
                  <input required type="file" name="file" accept="image/jpeg,image/png,image/webp" />
                </label>
                <button>Submit receipt</button>
              </form>
              {receiptMessage && <small>{receiptMessage}</small>}
            </aside>
          )}
          <Link className="button button-dark" href={`/track-order?order=${encodeURIComponent(result.orderNumber)}`}>
            Track this order
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main>
      <StoreHeader />
      <section className="checkout-page">
        <header>
          <p className="eyebrow">Secure checkout</p>
          <h1>Delivery &amp; payment</h1>
        </header>
        {!items.length ? (
          <div className="cart-empty">
            <h2>Your bag is empty.</h2>
            <Link className="button button-dark" href="/shop">
              Return to the collection
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="checkout-layout">
            <div className="checkout-fields">
              <fieldset>
                <legend>01 · Contact</legend>
                <div className="checkout-grid">
                  <label>
                    <span>Full name *</span>
                    <input required name="customerName" autoComplete="name" />
                  </label>
                  <label>
                    <span>Phone / WhatsApp *</span>
                    <input required name="customerPhone" autoComplete="tel" placeholder="+923001234567" />
                  </label>
                  <label className="field-wide">
                    <span>Email (optional)</span>
                    <input type="email" name="customerEmail" autoComplete="email" />
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend>02 · Delivery address</legend>
                <div className="checkout-grid">
                  <label className="field-wide">
                    <span>Complete address *</span>
                    <textarea required name="address" rows={3} autoComplete="street-address" />
                  </label>
                  <label>
                    <span>City *</span>
                    <input required name="city" autoComplete="address-level2" />
                  </label>
                  <label>
                    <span>Province *</span>
                    <select required name="province" defaultValue="">
                      <option value="" disabled>
                        Choose province
                      </option>
                      {PROVINCES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-wide">
                    <span>Delivery zone *</span>
                    <select required value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
                      {zones.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {money.format(item.deliveryCharge)} · {item.estimatedDaysMin}–
                          {item.estimatedDaysMax} days
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend>03 · Payment</legend>
                <div className="payment-options">
                  <label className={payment === "cod" ? "active" : ""}>
                    <input type="radio" name="payment" checked={payment === "cod"} onChange={() => setPayment("cod")} />
                    <span>
                      <strong>Cash on delivery</strong>
                      <small>Reserved for 12 hours while we confirm by phone or WhatsApp.</small>
                    </span>
                  </label>
                  <label className={payment === "bank_deposit" ? "active" : ""}>
                    <input
                      type="radio"
                      name="payment"
                      checked={payment === "bank_deposit"}
                      onChange={() => setPayment("bank_deposit")}
                    />
                    <span>
                      <strong>Bank deposit</strong>
                      <small>Reserved for 24 hours while payment is verified.</small>
                    </span>
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend>04 · Coupon (optional)</legend>
                {coupon ? (
                  <div className="checkout-grid">
                    <label className="field-wide">
                      <span>Applied</span>
                      <strong>
                        {coupon.code}
                        {coupon.description ? ` — ${coupon.description}` : ""}
                      </strong>
                    </label>
                    <button type="button" className="text-link" onClick={removeCoupon}>
                      Remove coupon
                    </button>
                  </div>
                ) : (
                  <div className="checkout-grid">
                    <label className="field-wide">
                      <span>Coupon code</span>
                      <input
                        value={couponInput}
                        onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                        placeholder="e.g. WELCOME10"
                      />
                    </label>
                    <button
                      type="button"
                      className="text-link"
                      disabled={couponBusy || !couponInput.trim()}
                      onClick={() => applyCoupon(couponInput)}
                    >
                      {couponBusy ? "Checking…" : "Apply coupon"}
                    </button>
                    {couponError && <p className="checkout-error field-wide">{couponError}</p>}
                  </div>
                )}
              </fieldset>
              <label className="checkout-notes">
                <span>Order note (optional)</span>
                <textarea name="notes" rows={3} />
              </label>
            </div>
            <aside className="checkout-summary">
              <p className="eyebrow">Your order</p>
              {items.map((item) => (
                <div className="checkout-line" key={item.variantId}>
                  <span>
                    {item.name}
                    <small>
                      {item.variantName} · Qty {item.quantity}
                    </small>
                  </span>
                  <strong>{money.format(item.price * item.quantity)}</strong>
                </div>
              ))}
              <div className="checkout-total">
                <p>
                  <span>Subtotal</span>
                  <strong>{money.format(subtotal)}</strong>
                </p>
                <p>
                  <span>Delivery</span>
                  <strong>{delivery ? money.format(delivery) : "Complimentary"}</strong>
                </p>
                {coupon && coupon.discount > 0 && (
                  <p>
                    <span>Coupon ({coupon.code})</span>
                    <strong>−{money.format(coupon.discount)}</strong>
                  </p>
                )}
                <p>
                  <span>Total</span>
                  <strong>{money.format(total)}</strong>
                </p>
              </div>
              {error && <p className="checkout-error">{error}</p>}
              <button className="add-button" disabled={busy || !zoneId}>
                {busy ? "Placing order…" : "Place order"}
                <span>→</span>
              </button>
              <small>By placing the order, you agree to the store terms and reservation policy.</small>
            </aside>
          </form>
        )}
      </section>
    </main>
  );
}
