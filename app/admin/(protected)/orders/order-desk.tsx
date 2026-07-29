"use client";

import { useEffect, useMemo, useState } from "react";

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
  createdAt: string;
  proofId: string | null;
  proofStatus: string | null;
};

type OrderItem = {
  id: string;
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
  }

  function closeDrawer() {
    setSelectedId(null);
    setDetail(null);
    setItems([]);
    setHistory([]);
    setProofs([]);
    setNote("");
  }

  async function transition(toStatus: string) {
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
          <p className="eyebrow">Muse &amp; Silk</p>
          <h1>Order desk</h1>
        </div>
      </header>
      {message && (
        <div className="admin-message" role="status">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}
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
                            <strong>{item.productName}</strong>
                            <small>{item.variantName}</small>
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
                    <button onClick={() => viewProof(proof.id)}>View receipt ↗</button>
                    <small>{proof.status}</small>
                    {proof.status === "pending" && (
                      <>
                        <button onClick={() => reviewProof(proof.id, "approved")}>Mark payment verified</button>
                        <button onClick={() => reviewProof(proof.id, "rejected")}>Reject</button>
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
                    <button key={next} onClick={() => transition(next)}>
                      Move to {next.replaceAll("_", " ")}
                    </button>
                  ))}
                  {!(NEXT_STATUSES[detail.orderStatus] ?? []).length && <small>This order has reached a final status.</small>}
                </div>
              </div>

              <div>
                <p className="eyebrow">History</p>
                {history.map((entry) => (
                  <p key={entry.id}>
                    <small>
                      {new Date(entry.createdAt).toLocaleString("en-PK")} — {entry.fromStatus ?? "created"} → {entry.toStatus} ({entry.actorEmail})
                      {entry.note ? `: ${entry.note}` : ""}
                    </small>
                  </p>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}
