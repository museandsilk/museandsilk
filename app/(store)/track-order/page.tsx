"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { hasCustomerPushToken, pushSupport, registerCustomerPush } from "@/lib/customer-push";
import { useLockedAction } from "@/lib/use-locked-action";

type Tracked = {
  courier: { name: string; trackingNumber: string; status: string } | null;
  order: {
    orderNumber: string;
    customerName: string;
    city: string;
    total: number;
    paymentMethod: string;
    paymentStatus: string;
    orderStatus: string;
    reservationExpiresAt: string | null;
    createdAt: string;
  };
  items: { productName: string; variantName: string; quantity: number; lineTotal: number }[];
  history: { status: string; note: string | null; createdAt: string }[];
};

function TrackOrderForm() {
  const params = useSearchParams();
  const [result, setResult] = useState<Tracked | null>(null);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [pushNote, setPushNote] = useState("");
  const [pushOn, setPushOn] = useState(false);
  const lookup = useLockedAction();
  const pushAction = useLockedAction();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    await lookup.run(async () => {
      setError("");
      try {
        const response = await fetch("/api/orders/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (response.ok) {
          setResult(data as Tracked);
          setPhone(body.phone ?? "");
          setPushOn(hasCustomerPushToken());
        } else {
          setResult(null);
          setError(data.error ?? "No matching order was found.");
        }
      } catch {
        setResult(null);
        setError("Could not reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <section className="track-page">
      <div className="track-intro">
        <p className="eyebrow">Order care</p>
        <h1>Track your order</h1>
        <p>Enter the order number from your confirmation and the same phone number used at checkout.</p>
        <form onSubmit={submit}>
          <label>
            <span>Order number</span>
            <input required name="orderNumber" defaultValue={params.get("order") ?? ""} placeholder="NA-261005-123456" />
          </label>
          <label>
            <span>Phone / WhatsApp</span>
            <input required name="phone" placeholder="+923001234567" />
          </label>
          <button className="button button-dark" disabled={lookup.pending} aria-busy={lookup.pending}>
            {lookup.pending ? (
              <span className="busy-label">
                <span className="spinner spinner-light" aria-hidden="true" /> Looking…
              </span>
            ) : (
              "Find my order"
            )}
          </button>
        </form>
        {error && <p className="checkout-error">{error}</p>}
      </div>
      {result && (
        <div className="tracking-result">
          <header>
            <p className="eyebrow">{result.order.orderNumber}</p>
            <h2>{result.order.orderStatus.replaceAll("_", " ")}</h2>
            <span>
              PKR {result.order.total.toLocaleString("en-PK")} · {result.order.paymentStatus === "paid" ? "Paid" : "Payment pending"}
            </span>
            {pushSupport() === "available" && !pushOn && (
              <p>
                <button
                  type="button"
                  className="text-link"
                  disabled={pushAction.pending}
                  aria-busy={pushAction.pending}
                  onClick={() =>
                    pushAction.run(async () => {
                      const outcome = await registerCustomerPush({ orderNumber: result.order.orderNumber, phone });
                      if (outcome.ok) {
                        setPushOn(true);
                        setPushNote("");
                      } else setPushNote(outcome.error);
                    })
                  }
                >
                  {pushAction.pending ? "Enabling…" : "Get updates on this device"}
                </button>
                {pushNote && <small> {pushNote}</small>}
              </p>
            )}
            {pushOn && (
              <p>
                <small>Updates on: you&apos;ll be notified here when this order changes.</small>
              </p>
            )}
            {result.courier && (
              <p>
                <small>
                  Shipped with {result.courier.name} · Tracking no. <strong>{result.courier.trackingNumber}</strong>
                  {result.courier.status ? ` · ${result.courier.status}` : ""}
                </small>
              </p>
            )}
          </header>
          <div className="tracking-timeline">
            {result.history.map((entry, index) => (
              <article key={`${entry.status}-${entry.createdAt}`} className={index === 0 ? "active" : ""}>
                <i />
                <div>
                  <strong>{entry.status.replaceAll("_", " ")}</strong>
                  <small>{entry.note}</small>
                  <time>{new Date(entry.createdAt).toLocaleString("en-PK")}</time>
                </div>
              </article>
            ))}
          </div>
          <div className="tracking-items">
            <h3>Reserved pieces</h3>
            {result.items.map((item) => (
              <p key={`${item.productName}-${item.variantName}`}>
                <span>
                  {item.productName}
                  <small>
                    {item.variantName} · Qty {item.quantity}
                  </small>
                </span>
                <strong>PKR {item.lineTotal.toLocaleString("en-PK")}</strong>
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function TrackOrderPage() {
  return (
    <main>
      <Suspense fallback={null}>
        <TrackOrderForm />
      </Suspense>
    </main>
  );
}
