"use client";

import { FormEvent, useState } from "react";
import { CUSTOMER_CANCEL_REASONS, PAYOUT_METHODS, REFUND_REASONS, refundReasonLabel } from "@/lib/order-rules";
import { useLockedAction } from "@/lib/use-locked-action";

export type TrackActions = { canCancel: boolean; cancelBlockedReason: string | null; canRequestRefund: boolean; refundBlockedReason: string | null };
export type TrackRefund = { status: string; amount: number; reason: string; needsPayoutDetails: boolean; adminNote: string | null; refundedAt: string | null; reference: string | null };

const REFUND_TEXT: Record<string, string> = {
  requested: "We have received your refund request and will review it soon.",
  approved: "Your refund was approved. We will send your money shortly.",
  refunded: "Your refund has been sent.",
  rejected: "We could not approve this refund request.",
};

/** "Cancel my order" and "Ask for a refund" for shoppers (no account – the order number + phone already proved who they are). */
export function OrderHelp({ orderNumber, orderStatus, phone, actions, refund, total, onChanged }: { orderNumber: string; orderStatus: string; phone: string; actions: TrackActions; refund: TrackRefund | null; total: number; onChanged: () => void }) {
  const [panel, setPanel] = useState<"cancel" | "refund" | "payout" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const action = useLockedAction();

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.run(async () => {
      setError("");
      const response = await fetch("/api/orders/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber, phone, reason: form.get("reason"), note: String(form.get("note") ?? "") || undefined }) }).catch(() => null);
      const data = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
      if (response?.ok) {
        setPanel(null);
        setDone("Your order has been cancelled.");
        onChanged();
      } else setError(data?.error ?? "Could not cancel the order. Please check your internet and try again.");
    });
  }

  async function sendRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("orderNumber", orderNumber);
    form.set("phone", phone);
    if (panel === "payout" && refund) form.set("reason", refund.reason);
    await action.run(async () => {
      setError("");
      const response = await fetch("/api/orders/refund", { method: "POST", body: form }).catch(() => null);
      const data = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
      if (response?.ok) {
        setPanel(null);
        setDone(panel === "payout" ? "Thank you — we will send your refund to that account." : "Your refund request has been sent. We will review it and tell you the result.");
        onChanged();
      } else setError(data?.error ?? "Could not send your request. Please check your internet and try again.");
    });
  }

  const busy = action.pending;
  const submit = (label: string, busyLabel: string) => (
    <button className="button button-dark" disabled={busy} aria-busy={busy}>
      {busy ? (
        <span className="busy-label">
          <span className="spinner spinner-light" aria-hidden="true" /> {busyLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );

  const payoutFields = (
    <>
      <label>
        <span>Where should we send your money?</span>
        <select name="payoutMethod" required defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {PAYOUT_METHODS.map((method) => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Account or mobile wallet number</span>
        <input name="payoutAccount" required minLength={6} maxLength={60} placeholder="e.g. 0300 1234567 or PK36 SCBL …" autoComplete="off" />
      </label>
      <label>
        <span>Name on that account</span>
        <input name="payoutTitle" required minLength={3} maxLength={80} autoComplete="name" />
      </label>
    </>
  );

  return (
    <section className="order-help" aria-label="Help with this order">
      {done && <p className="order-help-done" role="status">{done}</p>}

      {refund && (
        <div className="order-help-card">
          <h3>Refund</h3>
          <p>
            <strong>PKR {refund.amount.toLocaleString("en-PK")}</strong> — {REFUND_TEXT[refund.status] ?? refund.status}
          </p>
          <small>Reason: {refundReasonLabel(refund.reason)}</small>
          {refund.adminNote && <p>Message from us: “{refund.adminNote}”</p>}
          {refund.status === "refunded" && <small>Reference: {refund.reference} {refund.refundedAt ? `· ${new Date(refund.refundedAt).toLocaleDateString("en-PK")}` : ""}</small>}
          {refund.needsPayoutDetails && panel !== "payout" && (
            <button type="button" className="button button-dark" onClick={() => { setError(""); setPanel("payout"); }}>
              Tell us where to send the money
            </button>
          )}
        </div>
      )}

      {actions.canCancel && panel !== "cancel" && (
        <div className="order-help-card">
          <h3>Changed your mind?</h3>
          <p>You can cancel this order until it is handed to TCS.</p>
          <button type="button" className="button button-light" onClick={() => { setError(""); setPanel("cancel"); }}>
            Cancel my order
          </button>
        </div>
      )}
      {!actions.canCancel && actions.cancelBlockedReason && (orderStatus === "shipped" || orderStatus === "delivered") && <p className="order-help-muted">{actions.cancelBlockedReason}</p>}

      {actions.canRequestRefund && panel !== "refund" && (
        <div className="order-help-card">
          <h3>Not happy with your order?</h3>
          <p>Ask for a refund and we will look at it quickly.</p>
          <button type="button" className="button button-light" onClick={() => { setError(""); setPanel("refund"); }}>
            Ask for a refund
          </button>
        </div>
      )}
      {!actions.canRequestRefund && actions.refundBlockedReason && !refund && orderStatus === "delivered" && <p className="order-help-muted">{actions.refundBlockedReason}</p>}

      {panel === "cancel" && (
        <form className="order-help-form" onSubmit={cancel}>
          <h3>Cancel order {orderNumber}</h3>
          <label>
            <span>Why are you cancelling?</span>
            <select name="reason" required defaultValue={CUSTOMER_CANCEL_REASONS[0].value}>
              {CUSTOMER_CANCEL_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Anything else we should know? (optional)</span>
            <input name="note" maxLength={300} />
          </label>
          {error && <p className="checkout-error" role="alert">{error}</p>}
          <div className="order-help-actions">
            {submit("Yes, cancel my order", "Cancelling…")}
            <button type="button" className="button button-light" onClick={() => setPanel(null)} disabled={busy}>
              Keep my order
            </button>
          </div>
        </form>
      )}

      {(panel === "refund" || panel === "payout") && (
        <form className="order-help-form" onSubmit={sendRefund}>
          <h3>{panel === "payout" ? "Where should we send your refund?" : `Refund for order ${orderNumber}`}</h3>
          {panel === "refund" && (
            <>
              <p className="order-help-muted">Refund amount: PKR {total.toLocaleString("en-PK")}</p>
              <label>
                <span>What went wrong?</span>
                <select name="reason" required defaultValue="">
                  <option value="" disabled>
                    Choose a reason
                  </option>
                  {REFUND_REASONS.filter((reason) => reason.value !== "order_cancelled").map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Tell us more (optional)</span>
                <textarea name="details" rows={3} maxLength={1000} />
              </label>
              <label>
                <span>Photos (optional, up to 3) — helpful if the item is damaged</span>
                <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
              </label>
            </>
          )}
          {payoutFields}
          {error && <p className="checkout-error" role="alert">{error}</p>}
          <div className="order-help-actions">
            {submit(panel === "payout" ? "Send details" : "Send refund request", "Sending…")}
            <button type="button" className="button button-light" onClick={() => setPanel(null)} disabled={busy}>
              Close
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
