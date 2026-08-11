"use client";

import Link from "next/link";
import Script from "next/script";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { StoreHeader } from "@/app/(store)/_components/store-components";
import { clearCart, readCart, type CartItem } from "@/lib/cart";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const GOOGLE_MERCHANT_ID = process.env.NEXT_PUBLIC_GOOGLE_MERCHANT_ID;

type Zone = { id: string; name: string; deliveryCharge: number; estimatedDaysMin: number; estimatedDaysMax: number };
type Settings = {
  freeDeliveryThreshold: number;
  whatsappNumber: string;
  bankName: string;
  bankAccountTitle: string;
  bankAccountNumber: string;
  bankIban: string;
  codReservationHours: number;
  bankReservationHours: number;
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
  customerEmail: string | null;
  estimatedDeliveryDate: string | null;
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

  // Email verification gate — see /api/checkout/request-otp and /api/checkout/verify-otp. A
  // verified phone number skips this entirely (see phoneValid below); OTP is only required when
  // email is the *only* contact method given. The order can't be placed until otpToken is set in
  // that case; editing the email after verifying clears it so a switched-in address can't ride on
  // a code that was sent to a different one.
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [showPhonePopup, setShowPhonePopup] = useState(false);
  const [phonePopupDismissed, setPhonePopupDismissed] = useState(false);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = window.setInterval(() => setOtpCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [otpCooldown]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    (window as Window & { onTurnstileSuccess?: (token: string) => void }).onTurnstileSuccess = (token: string) =>
      setTurnstileToken(token);
  }, []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail);
  const phoneValid = customerPhone.replace(/\D/g, "").length >= 10;
  // Email OTP is only required when email is the sole contact method — a valid phone number skips
  // it entirely, whether or not an email was also given.
  const emailOtpRequired = emailValid && !phoneValid;
  const canPlaceOrder = phoneValid || (emailValid && Boolean(otpToken));

  // Nudge once toward the faster path (phone, no OTP) right as it becomes clear OTP would
  // otherwise be needed. Only fires the first time; dismissing it (or later adding a phone number)
  // never re-opens it for this checkout attempt.
  useEffect(() => {
    if (emailOtpRequired && !phonePopupDismissed && !otpToken) {
      setShowPhonePopup(true);
    }
  }, [emailOtpRequired, phonePopupDismissed, otpToken]);

  function dismissPhonePopup() {
    setShowPhonePopup(false);
    setPhonePopupDismissed(true);
  }

  async function requestOtp() {
    if (!emailValid || otpBusy || (TURNSTILE_SITE_KEY && !turnstileToken)) return;
    setOtpBusy(true);
    setOtpMessage("");
    try {
      const response = await fetch("/api/checkout/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: customerEmail, turnstileToken }),
      });
      const data = await response.json();
      if (!response.ok) {
        setOtpMessage(data.error ?? "Could not send the code.");
        return;
      }
      setOtpSent(true);
      setOtpCooldown(60);
      setOtpMessage("Code sent — check your inbox.");
    } catch {
      setOtpMessage("Could not reach the server. Check your connection and try again.");
    } finally {
      setOtpBusy(false);
    }
  }

  async function verifyOtpCode() {
    if (!/^\d{6}$/.test(otpCode) || otpBusy) return;
    setOtpBusy(true);
    setOtpMessage("");
    try {
      const response = await fetch("/api/checkout/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: customerEmail, code: otpCode }),
      });
      const data = await response.json();
      if (!response.ok) {
        setOtpMessage(data.error ?? "That code is incorrect.");
        return;
      }
      setOtpToken(data.verifiedToken);
      setOtpMessage("Email verified.");
    } catch {
      setOtpMessage("Could not reach the server. Check your connection and try again.");
    } finally {
      setOtpBusy(false);
    }
  }

  // Browser autofill sets an input's DOM value directly without reliably firing React's onChange
  // (a known Chrome/webkit gap), so a customer whose browser autofills phone/address never updates
  // this component's state — phoneValid silently stays false even though the field visibly shows a
  // number, breaking both the OTP-skip popup and the submit gate. Autofilled fields get a
  // detectable CSS animation (see .checkout-fields input:-webkit-autofill in globals.css); this
  // catches that and syncs state from the real DOM value the moment it fires.
  function onAutofill(setter: (value: string) => void) {
    return (event: React.AnimationEvent<HTMLInputElement>) => {
      if (event.animationName === "onAutoFillStart") setter(event.currentTarget.value);
    };
  }

  function onEmailChange(value: string) {
    setCustomerEmail(value);
    if (otpToken || otpSent) {
      setOtpToken("");
      setOtpSent(false);
      setOtpCode("");
      setOtpMessage("");
    }
  }
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
  const delivery = subtotal >= Number(settings?.freeDeliveryThreshold ?? 4000) ? 0 : Number(zone?.deliveryCharge ?? 0);
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
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    // Re-derive from the form's actual current values rather than trusting React state alone here
    // — the autofill-detection fix above (onAutofill/:-webkit-autofill) covers the normal case, but
    // FormData always reflects what's really in the DOM regardless of whether that fired, so this
    // is the backstop that keeps a real, filled-in phone number from ever being wrongly blocked.
    const formPhoneValid = (values.customerPhone ?? "").replace(/\D/g, "").length >= 10;
    const formEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.customerEmail ?? "");
    if (!formPhoneValid && !formEmailValid) {
      setError("Enter your phone number or email so we can reach you.");
      return;
    }
    if (!formPhoneValid && !(formEmailValid && otpToken)) {
      setError("Verify your email before placing the order.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          ...values,
          zoneId,
          paymentMethod: payment,
          couponCode: coupon?.code,
          otpToken,
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
        // Fire the actual conversion event — without this, Meta/Google only ever see PageViews and
        // have no signal that a purchase happened, which makes ad-spend optimization blind.
        const trackers = window as Window & {
          fbq?: (...args: unknown[]) => void;
          gtag?: (...args: unknown[]) => void;
        };
        trackers.fbq?.("track", "Purchase", { value: data.total, currency: "PKR" });
        trackers.gtag?.("event", "purchase", {
          transaction_id: data.orderNumber,
          value: data.total,
          currency: "PKR",
        });
      }
    } catch {
      setError("The order could not be placed. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // Google Customer Reviews opt-in — only after a successful order that actually has an email
  // (Google requires it as a field, and email is now optional at checkout — see the phone/email
  // OTP logic above). Sets up the callback the platform.js script invokes once loaded via its
  // ?onload=renderOptIn query param, same pattern as Turnstile's onTurnstileSuccess above.
  useEffect(() => {
    if (!result?.customerEmail || !GOOGLE_MERCHANT_ID) return;
    (window as Window & { renderOptIn?: () => void }).renderOptIn = () => {
      const gapiWindow = window as unknown as {
        gapi?: { load: (module: string, callback: () => void) => void; surveyoptin?: { render: (options: Record<string, unknown>) => void } };
      };
      gapiWindow.gapi?.load("surveyoptin", () => {
        gapiWindow.gapi?.surveyoptin?.render({
          merchant_id: Number(GOOGLE_MERCHANT_ID),
          order_id: result.orderNumber,
          email: result.customerEmail,
          delivery_country: "PK",
          estimated_delivery_date: result.estimatedDeliveryDate,
        });
      });
    };
  }, [result]);

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
    return (
      <main>
        <StoreHeader />
        <section className="order-success">
          <p className="eyebrow">Order received</p>
          <span className="success-mark">◇</span>
          <h1>
            Thank you.
            <br />
            Your order is confirmed.
          </h1>
          <div>
            <span>Order number</span>
            <strong>{result.orderNumber}</strong>
            <button onClick={() => navigator.clipboard.writeText(result.orderNumber)}>Copy</button>
          </div>
          <p>
            {result.customerEmail
              ? "We've sent a confirmation to your email."
              : "We've sent a confirmation to your WhatsApp."}
            {result.discount > 0 && <> Your coupon saved you {money.format(result.discount)}.</>}
          </p>
          {result.customerEmail && GOOGLE_MERCHANT_ID && (
            <Script src="https://apis.google.com/js/platform.js?onload=renderOptIn" strategy="afterInteractive" />
          )}
          {result.paymentMethod === "bank_deposit" && result.bank && (
            <aside>
              <h2>Bank deposit details</h2>
              <p>{result.bank.name}</p>
              <p>{result.bank.accountTitle}</p>
              <p>{result.bank.accountNumber}</p>
              {result.bank.iban && <p>{result.bank.iban}</p>}
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
          <p className="order-success-returns">
            Changed your mind once it arrives? <Link href="/policies/returns">Read our return policy</Link>.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <StoreHeader />
      <section className="checkout-page">
        <header>
          <div>
            <p className="eyebrow">Secure checkout</p>
            <h1>Delivery &amp; payment</h1>
          </div>
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
                    <span>Phone / WhatsApp {!emailValid && "*"}</span>
                    <input
                      name="customerPhone"
                      autoComplete="tel"
                      placeholder="+923001234567"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      onAnimationStart={onAutofill(setCustomerPhone)}
                    />
                  </label>
                  <label className="field-wide">
                    <span>Email {!phoneValid && "*"}</span>
                    <input
                      type="email"
                      name="customerEmail"
                      autoComplete="email"
                      value={customerEmail}
                      onChange={(event) => onEmailChange(event.target.value)}
                      onAnimationStart={onAutofill(onEmailChange)}
                      readOnly={Boolean(otpToken)}
                    />
                  </label>
                  <small className="field-wide checkout-contact-hint">Enter your phone number or email — at least one is required.</small>
                  {emailOtpRequired && (
                  <div className="field-wide checkout-otp">
                    {TURNSTILE_SITE_KEY && !otpToken && (
                      <>
                        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
                        <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-callback="onTurnstileSuccess" />
                      </>
                    )}
                    {otpToken ? (
                      <p className="checkout-otp-verified">✓ Email verified</p>
                    ) : !otpSent ? (
                      <button
                        type="button"
                        className="text-link"
                        disabled={!emailValid || otpBusy || Boolean(TURNSTILE_SITE_KEY) && !turnstileToken}
                        onClick={requestOtp}
                      >
                        {otpBusy ? (
                          <span className="busy-label">
                            <span className="spinner" aria-hidden="true" /> Sending…
                          </span>
                        ) : (
                          "Send verification code"
                        )}
                      </button>
                    ) : (
                      <div className="checkout-otp-verify">
                        <label>
                          <span>Enter the 6-digit code</span>
                          <input
                            inputMode="numeric"
                            maxLength={6}
                            value={otpCode}
                            onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="000000"
                          />
                        </label>
                        <button type="button" className="text-link" disabled={otpCode.length !== 6 || otpBusy} onClick={verifyOtpCode}>
                          {otpBusy ? (
                            <span className="busy-label">
                              <span className="spinner" aria-hidden="true" /> Verifying…
                            </span>
                          ) : (
                            "Verify code"
                          )}
                        </button>
                        <button type="button" className="text-link" disabled={otpCooldown > 0 || otpBusy} onClick={requestOtp}>
                          {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend code"}
                        </button>
                      </div>
                    )}
                    {otpMessage && <p className="checkout-otp-message">{otpMessage}</p>}
                  </div>
                  )}
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
                      <small>Reserved for {settings?.codReservationHours ?? 6} hours while we confirm your order.</small>
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
                      <small>Reserved for {settings?.bankReservationHours ?? 6} hours while payment is verified.</small>
                    </span>
                  </label>
                </div>
                {payment === "bank_deposit" && settings?.bankAccountNumber && (
                  <aside className="bank-deposit-preview">
                    <p>Send payment to:</p>
                    <p>{settings.bankName}</p>
                    <p>{settings.bankAccountTitle}</p>
                    <p>{settings.bankAccountNumber}</p>
                    {settings.bankIban && <p>{settings.bankIban}</p>}
                    <small>You&apos;ll be asked to upload your payment receipt after placing the order.</small>
                  </aside>
                )}
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
                      {couponBusy ? (
                        <span className="busy-label">
                          <span className="spinner" aria-hidden="true" /> Checking…
                        </span>
                      ) : (
                        "Apply coupon"
                      )}
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
              <button className="add-button" disabled={busy || !zoneId || !canPlaceOrder}>
                {busy ? (
                  <span className="busy-label">
                    <span className="spinner spinner-light" aria-hidden="true" /> Placing order…
                  </span>
                ) : (
                  "Place order"
                )}
                <span>→︎</span>
              </button>
              {!canPlaceOrder && (
                <small className="checkout-otp-hint">
                  {emailValid ? "Verify your email above to place the order." : "Enter your phone number or email to place the order."}
                </small>
              )}
              <small>
                By placing the order, you agree to the store terms and reservation policy. Not the right fit?{" "}
                <Link href="/policies/returns">See our return policy</Link>.
              </small>
            </aside>
          </form>
        )}
        {showPhonePopup && (
          <div className="phone-otp-popup" role="dialog" aria-modal="true" aria-label="Skip email verification">
            <div className="phone-otp-popup-card">
              <button type="button" className="phone-otp-popup-close" aria-label="Close" onClick={dismissPhonePopup}>
                ×
              </button>
              <p className="phone-otp-popup-title">Skip email verification</p>
              <p>Enter your WhatsApp number to avoid email OTP verification.</p>
              <input
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="+923001234567"
                autoFocus
              />
              <button type="button" className="button button-dark" disabled={!phoneValid} onClick={dismissPhonePopup}>
                Use this number
              </button>
              <button type="button" className="text-link" onClick={dismissPhonePopup}>
                Continue with email verification instead
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
