"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLockedAction } from "@/lib/use-locked-action";
import { PlaceOrderPanel, type PanelMode } from "./place-order-panel";

type OrderRow = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  city: string;
  province: string;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  reservationExpiresAt: string | null;
  postexTrackingNumber: string | null;
  postexStatus: string | null;
  createdAt: string;
  proofId: string | null;
  proofStatus: string | null;
};

type OrderItem = {
  id: string;
  // From a left join on products: null once the product has been deleted, and productStatus is only
  // "published" while the product is actually visible on the storefront.
  productSlug: string | null;
  productStatus: string | null;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

type StatusHistory = { id: string; fromStatus: string | null; toStatus: string; note: string | null; actorEmail: string; createdAt: string };

type OrderDetail = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  city: string;
  province: string;
  address: string;
  deliveryNotes: string | null;
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  notes: string | null;
};

type PaymentProof = { id: string; status: string; reviewNote: string | null };

type PostexForm = {
  cities: string[];
  suggestedCity: string | null;
  phone: string | null;
  invoicePayment: number;
  items: number;
  pickupAddresses: Array<{ addressCode: string; label: string }>;
  defaultPickupCode: string | null;
};
// Mirrors GET /api/admin/orders/[id]/postex — `configured: false` means POSTEX_API_TOKEN isn't set,
// in which case the whole courier section stays hidden.
type PostexState =
  | { configured: false }
  | { configured: true; booking: { trackingNumber: string; bookedAt: string | null; status: string | null; syncedAt: string | null } }
  | { configured: true; booking: null; canBook: boolean; autoError: string | null; form: PostexForm };
type PostexTracking = { transactionStatus: string | null; transactionStatusHistory: Array<{ transactionStatusMessage: string; transactionStatusMessageCode: string }> };

const statuses = ["pending_confirmation", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled", "returned"];

const NEXT_STATUSES: Record<string, string[]> = {
  pending_confirmation: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned", "cancelled"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

export function OrderDesk() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [note, setNote] = useState("");
  // Which "place order for customer" panel is open (null = closed).
  const [placeMode, setPlaceMode] = useState<PanelMode | null>(null);

  // PostEx courier booking (see the "Courier" section of the drawer below).
  const [postex, setPostex] = useState<PostexState | null>(null);
  const [postexError, setPostexError] = useState("");
  const [postexBusy, setPostexBusy] = useState(false);
  const [tracking, setTracking] = useState<PostexTracking | null>(null);
  const [bookCity, setBookCity] = useState("");
  const [bookPhone, setBookPhone] = useState("");
  const [bookCod, setBookCod] = useState("0");
  const [bookItems, setBookItems] = useState("1");
  const [bookPickup, setBookPickup] = useState("");

  async function refresh() {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    const response = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" });
    if (response.ok) setOrders((await response.json()).orders);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const visible = useMemo(() => orders, [orders]);

  async function openOrder(id: string) {
    setSelectedId(id);
    const response = await fetch(`/api/admin/orders/${id}`, { cache: "no-store" });
    if (!response.ok) {
      setMessage("Could not load order.");
      return;
    }
    const data = await response.json();
    setDetail(data.order);
    setItems(data.items);
    setHistory(data.history);
    setProofs(data.proofs);
    void loadPostex(id);
  }

  function closeDrawer() {
    setSelectedId(null);
    setDetail(null);
    setItems([]);
    setHistory([]);
    setProofs([]);
    setNote("");
    setPostex(null);
    setPostexError("");
    setTracking(null);
  }

  async function loadPostex(id: string) {
    setPostexError("");
    setTracking(null);
    const response = await fetch(`/api/admin/orders/${id}/postex`, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      setPostex(null);
      setPostexError(data?.error ?? "Could not load courier details.");
      return;
    }
    setPostex(data as PostexState);
    if (data.configured && !data.booking) {
      const form = data.form as PostexForm;
      setBookCity(form.suggestedCity ?? "");
      setBookPhone(form.phone ?? "");
      setBookCod(String(form.invoicePayment));
      setBookItems(String(form.items));
      setBookPickup(form.defaultPickupCode ?? "");
    }
  }

  async function bookPostex() {
    if (!selectedId) return;
    setPostexBusy(true);
    setPostexError("");
    try {
      const response = await fetch(`/api/admin/orders/${selectedId}/postex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityName: bookCity,
          customerPhone: bookPhone || undefined,
          invoicePayment: Number(bookCod),
          items: Number(bookItems),
          pickupAddressCode: bookPickup || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setPostexError(data?.error ?? "PostEx booking failed.");
        return;
      }
      setMessage(
        data.booked
          ? `Booked with PostEx — tracking ${data.trackingNumber}.`
          : `Created at PostEx — tracking ${data.trackingNumber}. The pickup booking will complete automatically within a few minutes (or press “Sync from PostEx”).`,
      );
      await openOrder(selectedId);
    } finally {
      setPostexBusy(false);
    }
  }

  async function refreshTracking() {
    if (!selectedId) return;
    setPostexBusy(true);
    setPostexError("");
    try {
      const response = await fetch(`/api/admin/orders/${selectedId}/postex/tracking`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setPostexError(data?.error ?? "Could not fetch tracking.");
        return;
      }
      setTracking(data as PostexTracking);
    } finally {
      setPostexBusy(false);
    }
  }

  // Runs everything the 5-minute scheduled job does (auto-booking + status refresh) right now, for
  // all orders, or just the open one when an orderId is given.
  async function syncPostex(orderId?: string) {
    setPostexBusy(true);
    setPostexError("");
    try {
      const response = await fetch("/api/admin/postex/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderId ? { orderId } : {}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const text = data?.error ?? "PostEx sync failed.";
        setPostexError(text);
        setMessage(text);
        return;
      }
      const booked = data.autoBook?.booked ?? 0;
      const sync = data.sync ?? { checked: 0, moved: 0 };
      setMessage(
        `PostEx synced — ${sync.checked} parcel${sync.checked === 1 ? "" : "s"} checked, ${sync.moved} order${sync.moved === 1 ? "" : "s"} updated${booked ? `, ${booked} newly booked` : ""}.`,
      );
      await refresh();
      if (selectedId) await openOrder(selectedId);
    } finally {
      setPostexBusy(false);
    }
  }

  async function cancelPostex() {
    if (!selectedId) return;
    if (!window.confirm("Cancel this parcel's booking with PostEx? This does not change the order's own status.")) return;
    setPostexBusy(true);
    setPostexError("");
    try {
      const response = await fetch(`/api/admin/orders/${selectedId}/postex`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setPostexError(data?.error ?? "PostEx could not cancel the booking.");
        return;
      }
      setMessage("PostEx booking cancelled.");
      await openOrder(selectedId);
    } finally {
      setPostexBusy(false);
    }
  }

  // One in-flight status change / receipt review at a time: a double-click can never send two requests.
  const statusAction = useLockedAction();

  async function transition(toStatus: string) {
    if (!selectedId) return;
    await statusAction.run(() => transitionNow(toStatus));
  }

  async function transitionNow(toStatus: string) {
    if (!selectedId) return;
    const response = await fetch(`/api/admin/orders/${selectedId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStatus, note: note || undefined }),
    });
    const result = await response.json();
    setMessage(response.ok ? `Order moved to ${toStatus.replaceAll("_", " ")}.` : result.error ?? "Could not update order status.");
    if (response.ok) {
      setNote("");
      await refresh();
      await openOrder(selectedId);
    }
  }

  async function viewProof(proofId: string) {
    const response = await fetch(`/api/admin/payment-proofs/${proofId}`, { cache: "no-store" });
    if (!response.ok) {
      setMessage("Could not load payment proof.");
      return;
    }
    const data = await response.json();
    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  async function reviewProof(proofId: string, status: "approved" | "rejected") {
    await statusAction.run(() => reviewProofNow(proofId, status));
  }

  async function reviewProofNow(proofId: string, status: "approved" | "rejected") {
    const response = await fetch(`/api/admin/payment-proofs/${proofId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setMessage(response.ok ? `Payment receipt ${status}.` : "Receipt could not be reviewed.");
    if (response.ok) {
      await refresh();
      if (selectedId) await openOrder(selectedId);
    }
  }

  return (
    <section className="admin-main">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Nure Asmir</p>
          <h1>Order desk</h1>
        </div>
      </header>
      {message && (
        <div className="admin-message" role="status">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}
      <div className="admin-top-actions">
        <button className="admin-primary" onClick={() => setPlaceMode("single")}>
          Place order for customer
        </button>
        <button onClick={() => setPlaceMode("bulk")}>Bulk import (JSON)</button>
        <button onClick={() => window.location.assign("/api/admin/orders/place/template")}>Download order_place_template.json</button>
        <button disabled={postexBusy} onClick={() => syncPostex()}>
          {postexBusy ? "Syncing…" : "Sync PostEx now"}
        </button>
        <small>Booking and courier status also sync automatically every few minutes.</small>
      </div>
      <div className="order-filters">
        {["all", ...statuses].map((status) => (
          <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>
            {status.replaceAll("_", " ")}
          </button>
        ))}
      </div>
      <div className="admin-table-card">
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Payment</th>
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.orderNumber}</strong>
                    <small>{new Date(order.createdAt).toLocaleString("en-PK")}</small>
                  </td>
                  <td>
                    <strong>{order.customerName}</strong>
                    <small>
                      {order.customerPhone}
                      <br />
                      {order.city}, {order.province}
                    </small>
                  </td>
                  <td>
                    <strong>{order.paymentMethod.replaceAll("_", " ")}</strong>
                    <small>{order.paymentStatus}</small>
                    {order.proofId && <small> · receipt {order.proofStatus}</small>}
                  </td>
                  <td>PKR {order.total.toLocaleString("en-PK")}</td>
                  <td>
                    <span className={`status-pill status-${order.orderStatus}`}>{order.orderStatus.replaceAll("_", " ")}</span>
                    {order.postexTrackingNumber && order.postexTrackingNumber !== "PENDING" && (
                      <small>
                        PostEx · {order.postexStatus ?? "booked"}
                        <br />
                        {order.postexTrackingNumber}
                      </small>
                    )}
                  </td>
                  <td>
                    <button className="edit-link" onClick={() => openOrder(order.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <div className="admin-empty">
              <h3>No matching orders</h3>
              <p>New customer orders will appear here automatically.</p>
            </div>
          )}
        </div>
      </div>

      {selectedId && detail && (
        <div
          className="admin-drawer-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDrawer();
          }}
        >
          <aside className="admin-drawer">
            <header>
              <div>
                <p className="eyebrow">Order</p>
                <h2>{detail.orderNumber}</h2>
              </div>
              <button onClick={closeDrawer}>×</button>
            </header>

            <section className="product-operations">
              <div>
                <p className="eyebrow">Customer</p>
                <p>
                  <strong>{detail.customerName}</strong>
                  <br />
                  {detail.customerPhone}
                  {detail.customerEmail ? ` · ${detail.customerEmail}` : ""}
                  <br />
                  {detail.address}, {detail.city}, {detail.province}
                </p>
                {detail.deliveryNotes && <p><small>Delivery notes: {detail.deliveryNotes}</small></p>}
              </div>

              <div>
                <p className="eyebrow">Items</p>
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Qty</th>
                        <th>Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            {item.productSlug && item.productStatus === "published" ? (
                              // Opens the live product page in its own tab, outside the admin panel.
                              <Link href={`/products/${item.productSlug}`} target="_blank" rel="noopener noreferrer" prefetch={false}>
                                <strong>{item.productName} ↗︎</strong>
                              </Link>
                            ) : (
                              <strong>{item.productName}</strong>
                            )}
                            <small>
                              {item.variantName}
                              {!item.productSlug ? " · product no longer exists" : item.productStatus !== "published" ? " · not published — no public page" : ""}
                            </small>
                          </td>
                          <td>{item.sku}</td>
                          <td>{item.quantity}</td>
                          <td>PKR {item.lineTotal.toLocaleString("en-PK")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  Subtotal PKR {detail.subtotal.toLocaleString("en-PK")} · Delivery PKR {detail.deliveryCharge.toLocaleString("en-PK")}
                  {detail.discount > 0 ? ` · Discount PKR ${detail.discount.toLocaleString("en-PK")}` : ""}
                  {detail.tax > 0 ? ` · Tax PKR ${detail.tax.toLocaleString("en-PK")}` : ""}
                  {" · "}
                  <strong>Total PKR {detail.total.toLocaleString("en-PK")}</strong>
                </p>
              </div>

              <div>
                <p className="eyebrow">Payment</p>
                <p>
                  {detail.paymentMethod.replaceAll("_", " ")} · {detail.paymentStatus}
                </p>
                {proofs.map((proof) => (
                  <div key={proof.id} className="proof-actions">
                    <button onClick={() => viewProof(proof.id)}>View receipt ↗︎</button>
                    <small>{proof.status}</small>
                    {proof.status === "pending" && (
                      <>
                        <button disabled={statusAction.pending} onClick={() => reviewProof(proof.id, "approved")}>
                          {statusAction.pending ? "Working…" : "Mark payment verified"}
                        </button>
                        <button disabled={statusAction.pending} onClick={() => reviewProof(proof.id, "rejected")}>
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <p className="eyebrow">Move order status</p>
                <p>
                  Current: <span className={`status-pill status-${detail.orderStatus}`}>{detail.orderStatus.replaceAll("_", " ")}</span>
                </p>
                <label>
                  <span>Note (optional)</span>
                  <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Internal note for this transition" />
                </label>
                <div className="admin-top-actions">
                  {(NEXT_STATUSES[detail.orderStatus] ?? []).map((next) => (
                    <button key={next} disabled={statusAction.pending} aria-busy={statusAction.pending} onClick={() => transition(next)}>
                      {statusAction.pending ? (
                        <span className="busy-label">
                          <i className="spinner" /> Updating…
                        </span>
                      ) : (
                        <>Move to {next.replaceAll("_", " ")}</>
                      )}
                    </button>
                  ))}
                  {!(NEXT_STATUSES[detail.orderStatus] ?? []).length && <small>This order has reached a final status.</small>}
                </div>
              </div>

              {(postex?.configured || postexError) && (
                <div>
                  <p className="eyebrow">Courier · PostEx</p>
                  {postexError && <p><small>{postexError}</small></p>}

                  {postex?.configured && postex.booking && (
                    <>
                      <p>
                        Booked · tracking <strong>{postex.booking.trackingNumber}</strong>
                        {postex.booking.bookedAt ? <small> · {new Date(postex.booking.bookedAt).toLocaleString("en-PK")}</small> : null}
                        <br />
                        <small>
                          PostEx status: <strong>{postex.booking.status ?? "—"}</strong>
                          {postex.booking.syncedAt ? ` · checked ${new Date(postex.booking.syncedAt).toLocaleString("en-PK")}` : ""}
                        </small>
                      </p>
                      <div className="admin-top-actions">
                        <button disabled={postexBusy} onClick={() => syncPostex(selectedId ?? undefined)}>Sync from PostEx</button>
                        <button disabled={postexBusy} onClick={refreshTracking}>Refresh tracking</button>
                        <button
                          disabled={postexBusy}
                          onClick={() => window.open(`/api/admin/orders/${selectedId}/postex/airway-bill`, "_blank", "noopener,noreferrer")}
                        >
                          Airway bill (PDF) ↗︎
                        </button>
                        <button disabled={postexBusy} onClick={cancelPostex}>Cancel PostEx booking</button>
                      </div>
                      {tracking && (
                        <div>
                          <p><small>PostEx status: <strong>{tracking.transactionStatus ?? "—"}</strong></small></p>
                          {tracking.transactionStatusHistory.map((step, index) => (
                            <p key={`${step.transactionStatusMessageCode}-${index}`}>
                              <small>{step.transactionStatusMessage}</small>
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {postex?.configured && !postex.booking && !postex.canBook && (
                    <p><small>Confirm this order first — only confirmed, processing or packed orders can be booked with PostEx.</small></p>
                  )}

                  {postex?.configured && !postex.booking && postex.canBook && (
                    <>
                      {postex.autoError && <p><small>Automatic booking: {postex.autoError}</small></p>}
                      <label>
                        <span>Delivery city (PostEx)</span>
                        <select value={bookCity} onChange={(event) => setBookCity(event.target.value)}>
                          <option value="" disabled>
                            Choose a city
                          </option>
                          {postex.form.cities.map((city) => (
                            <option key={city}>{city}</option>
                          ))}
                        </select>
                        {!postex.form.suggestedCity && detail && <small>Customer typed “{detail.city}” — pick the matching PostEx city.</small>}
                      </label>
                      <label>
                        <span>Customer mobile (03xxxxxxxxx)</span>
                        <input value={bookPhone} onChange={(event) => setBookPhone(event.target.value)} placeholder="03001234567" />
                        {!postex.form.phone && <small>The number on this order isn’t a valid mobile — enter one.</small>}
                      </label>
                      <label>
                        <span>Cash to collect on delivery (PKR)</span>
                        <input inputMode="numeric" value={bookCod} onChange={(event) => setBookCod(event.target.value.replace(/\D/g, ""))} />
                        <small>Full total for cash on delivery; 0 for an order already paid by bank deposit.</small>
                      </label>
                      <label>
                        <span>Number of pieces</span>
                        <input inputMode="numeric" value={bookItems} onChange={(event) => setBookItems(event.target.value.replace(/\D/g, ""))} />
                      </label>
                      {postex.form.pickupAddresses.length > 1 && (
                        <label>
                          <span>Pickup address</span>
                          <select value={bookPickup} onChange={(event) => setBookPickup(event.target.value)}>
                            <option value="" disabled>
                              Choose a pickup address
                            </option>
                            {postex.form.pickupAddresses.map((address) => (
                              <option key={address.addressCode} value={address.addressCode}>
                                {address.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className="admin-top-actions">
                        <button
                          disabled={postexBusy || !bookCity || !bookPhone || bookCod === "" || !Number(bookItems) || (postex.form.pickupAddresses.length > 1 && !bookPickup)}
                          onClick={bookPostex}
                        >
                          {postexBusy ? "Booking…" : "Book with PostEx"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div>
                <p className="eyebrow">History</p>
                {history.map((entry) => (
                  <p key={entry.id}>
                    <small>
                      {new Date(entry.createdAt).toLocaleString("en-PK")} — {entry.fromStatus ?? "created"} →︎ {entry.toStatus} ({entry.actorEmail})
                      {entry.note ? `: ${entry.note}` : ""}
                    </small>
                  </p>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
      {placeMode && (
        <PlaceOrderPanel
          initialMode={placeMode}
          onClose={() => setPlaceMode(null)}
          onPlaced={(text) => {
            setMessage(text);
            void refresh();
          }}
        />
      )}
    </section>
  );
}
