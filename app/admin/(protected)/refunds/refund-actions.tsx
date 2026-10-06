"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useLockedAction } from "@/lib/use-locked-action";
import { callApi, Dialog, Hint, useToast } from "../../_ui/client";
import { pkr } from "../../_ui/ui";

type Mode = "approve" | "reject" | "refunded" | "return" | null;

export function RefundActions({ id, status, amount, orderTotal, hasReturn }: { id: string; status: string; amount: number; orderTotal: number; hasReturn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const action = useLockedAction();
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [value, setValue] = useState(String(amount));
  const [reference, setReference] = useState("");
  const [tracking, setTracking] = useState("");

  async function send(body: Record<string, unknown>, success: string) {
    await action.run(async () => {
      setError("");
      const result = await callApi(`/api/admin/refunds/${id}`, "POST", body);
      if (result.ok) {
        toast(success, "good");
        setMode(null);
        router.refresh();
      } else setError(result.error);
    });
  }

  const close = () => (action.pending ? undefined : setMode(null));
  const actions = (primary: string, busy: string, danger = false) => (
    <div className="a-dialog-actions">
      <button type="button" className="a-btn" onClick={() => setMode(null)} disabled={action.pending}>
        Close
      </button>
      <button className={`a-btn ${danger ? "a-btn-danger-solid" : "a-btn-primary"}`} disabled={action.pending} aria-busy={action.pending}>
        {action.pending ? (
          <span className="busy-label">
            <span className="spinner spinner-light" aria-hidden="true" /> {busy}
          </span>
        ) : (
          primary
        )}
      </button>
    </div>
  );

  return (
    <>
      <div className="a-row">
        {status === "requested" && (
          <>
            <button type="button" className="a-btn a-btn-primary" onClick={() => setMode("approve")}>
              Approve refund
            </button>
            <button type="button" className="a-btn a-btn-danger" onClick={() => setMode("reject")}>
              Decline
            </button>
          </>
        )}
        {status === "approved" && (
          <>
            <button type="button" className="a-btn a-btn-primary" onClick={() => setMode("refunded")}>
              Mark as refunded
            </button>
            {!hasReturn && (
              <button type="button" className="a-btn" onClick={() => setMode("return")}>
                Save return tracking number
              </button>
            )}
          </>
        )}
      </div>

      {mode === "approve" && (
        <Dialog title="Approve this refund" onClose={close}>
          <form
            className="a-stack"
            style={{ gap: 14 }}
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void send({ action: "approve", amount: Number(value), note: note || undefined }, "Refund approved. The customer has been told.");
            }}
          >
            <div className="a-field">
              <label htmlFor="rf-amount">
                Amount to refund (PKR) <Hint text={`Full refund is ${pkr(orderTotal)}. You may refund less, for example without the delivery charge.`} />
              </label>
              <input id="rf-amount" value={value} onChange={(event) => setValue(event.target.value.replace(/\D/g, ""))} inputMode="numeric" required />
            </div>
            <div className="a-field">
              <label htmlFor="rf-note">Message for the customer (optional)</label>
              <input id="rf-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Please send the item back with the tags on" />
            </div>
            {error && <p className="a-error" role="alert">{error}</p>}
            {actions("Approve", "Approving…")}
          </form>
        </Dialog>
      )}

      {mode === "reject" && (
        <Dialog title="Decline this refund" onClose={close}>
          <form
            className="a-stack"
            style={{ gap: 14 }}
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void send({ action: "reject", note }, "Request declined. The customer has been told.");
            }}
          >
            <div className="a-field">
              <label htmlFor="rf-why">Why are you declining? The customer will read this.</label>
              <textarea id="rf-why" value={note} onChange={(event) => setNote(event.target.value)} required minLength={3} rows={3} placeholder="e.g. The item shows signs of use, so we can’t accept the return." />
            </div>
            {error && <p className="a-error" role="alert">{error}</p>}
            {actions("Decline request", "Declining…", true)}
          </form>
        </Dialog>
      )}

      {mode === "refunded" && (
        <Dialog title="Mark as refunded" onClose={close}>
          <form
            className="a-stack"
            style={{ gap: 14 }}
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void send({ action: "refunded", amount: Number(value), reference }, "Marked as refunded. The customer has been told.");
            }}
          >
            <p className="a-muted">Do this after you have sent the money to the customer.</p>
            <div className="a-field">
              <label htmlFor="rf-sent">Amount you sent (PKR)</label>
              <input id="rf-sent" value={value} onChange={(event) => setValue(event.target.value.replace(/\D/g, ""))} inputMode="numeric" required />
            </div>
            <div className="a-field">
              <label htmlFor="rf-ref">
                Payment reference <Hint text="The transaction ID from your bank, JazzCash or Easypaisa app. It helps you find this payment later." />
              </label>
              <input id="rf-ref" value={reference} onChange={(event) => setReference(event.target.value)} required minLength={2} placeholder="e.g. TID 4893021" />
            </div>
            {error && <p className="a-error" role="alert">{error}</p>}
            {actions("Mark as refunded", "Saving…")}
          </form>
        </Dialog>
      )}

      {mode === "return" && (
        <Dialog title="Return parcel" onClose={close}>
          <form
            className="a-stack"
            style={{ gap: 14 }}
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void send({ action: "return_tracking", trackingNumber: tracking }, "Return tracking number saved.");
            }}
          >
            <p className="a-muted">If the customer is sending the item back with TCS, type the TCS tracking number of the return parcel so you can follow it.</p>
            <div className="a-field">
              <label htmlFor="rf-track">TCS tracking number</label>
              <input id="rf-track" value={tracking} onChange={(event) => setTracking(event.target.value)} required minLength={4} />
            </div>
            {error && <p className="a-error" role="alert">{error}</p>}
            {actions("Save", "Saving…")}
          </form>
        </Dialog>
      )}
    </>
  );
}
