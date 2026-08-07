"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type CouponType = "percentage" | "fixed";

type Coupon = {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  appliesToDelivery: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type Draft = {
  id: string;
  code: string;
  description: string;
  type: CouponType;
  value: string;
  minOrderAmount: string;
  maxDiscountAmount: string;
  maxRedemptions: string;
  appliesToDelivery: boolean;
  startsAt: string;
  expiresAt: string;
  active: boolean;
};

const emptyDraft: Draft = {
  id: "",
  code: "",
  description: "",
  type: "percentage",
  value: "",
  minOrderAmount: "0",
  maxDiscountAmount: "",
  maxRedemptions: "",
  appliesToDelivery: false,
  startsAt: "",
  expiresAt: "",
  active: true,
};

function toInputDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function couponToDraft(coupon: Coupon): Draft {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description ?? "",
    type: coupon.type,
    value: String(coupon.value),
    minOrderAmount: String(coupon.minOrderAmount),
    maxDiscountAmount: coupon.maxDiscountAmount === null ? "" : String(coupon.maxDiscountAmount),
    maxRedemptions: coupon.maxRedemptions === null ? "" : String(coupon.maxRedemptions),
    appliesToDelivery: coupon.appliesToDelivery,
    startsAt: toInputDateTime(coupon.startsAt),
    expiresAt: toInputDateTime(coupon.expiresAt),
    active: coupon.active,
  };
}

function statusInfo(coupon: Coupon): { label: string; className: string } {
  const now = Date.now();
  const expired = coupon.expiresAt ? new Date(coupon.expiresAt).getTime() < now : false;
  const scheduled = coupon.startsAt ? new Date(coupon.startsAt).getTime() > now : false;

  if (!coupon.active) return { label: "Disabled", className: "status-archived" };
  if (expired) return { label: "Expired", className: "status-archived" };
  if (scheduled) return { label: "Scheduled", className: "status-draft" };
  return { label: "Active", className: "status-published" };
}

function valueLabel(coupon: Coupon): string {
  return coupon.type === "percentage" ? `${coupon.value}% off` : `PKR ${coupon.value.toLocaleString("en-PK")} off`;
}

export function CouponsManager() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/coupons", { cache: "no-store" });
    if (response.ok) setCoupons((await response.json()).coupons);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function openNew() {
    setDraft({ ...emptyDraft });
  }

  function openEdit(coupon: Coupon) {
    setDraft(couponToDraft(coupon));
  }

  function closeDrawer() {
    setDraft(null);
  }

  async function toggleActive(coupon: Coupon) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !coupon.active }),
      });
      const result = await response.json();
      setMessage(response.ok ? `${coupon.code} ${coupon.active ? "disabled" : "enabled"}.` : result.error ?? "Could not update coupon.");
      if (response.ok) await refresh();
    } catch (error) {
      console.error("toggleActive failed", error);
      setMessage("Something went wrong — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      const payload = {
        code: draft.code.trim().toUpperCase(),
        description: draft.description.trim() || null,
        type: draft.type,
        value: Number(draft.value),
        minOrderAmount: draft.minOrderAmount === "" ? 0 : Number(draft.minOrderAmount),
        maxDiscountAmount: draft.type === "percentage" && draft.maxDiscountAmount !== "" ? Number(draft.maxDiscountAmount) : null,
        maxRedemptions: draft.maxRedemptions === "" ? null : Number(draft.maxRedemptions),
        appliesToDelivery: draft.appliesToDelivery,
        startsAt: draft.startsAt || null,
        expiresAt: draft.expiresAt || null,
        active: draft.active,
      };

      const response = await fetch(draft.id ? `/api/admin/coupons/${draft.id}` : "/api/admin/coupons", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      setMessage(response.ok ? "Coupon saved." : result.error ?? "Coupon could not be saved.");
      if (response.ok) {
        closeDrawer();
        await refresh();
      }
    } catch (error) {
      console.error("save coupon failed", error);
      setMessage("Something went wrong saving the coupon — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-main">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Muse &amp; Silk</p>
          <h1>Coupons</h1>
          <p>Create and manage discount codes customers can apply at checkout.</p>
        </div>
        <div className="admin-top-actions">
          <button onClick={openNew}>Add coupon</button>
        </div>
      </header>

      {message && (
        <div className="admin-message" role="status">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}

      <div className="admin-table-card">
        <div className="admin-table-tools">
          <div>
            <h2>All coupons</h2>
            <span>{coupons.length} records</span>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Min order</th>
                <th>Redemptions</th>
                <th>Status</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => {
                const status = statusInfo(coupon);
                return (
                  <tr key={coupon.id}>
                    <td>
                      <strong>{coupon.code}</strong>
                      {coupon.description && <small>{coupon.description}</small>}
                    </td>
                    <td>{valueLabel(coupon)}</td>
                    <td>PKR {coupon.minOrderAmount.toLocaleString("en-PK")}</td>
                    <td>
                      {coupon.redemptionCount} / {coupon.maxRedemptions ?? "Unlimited"}
                    </td>
                    <td>
                      <span className={`status-pill ${status.className}`}>{status.label}</span>
                    </td>
                    <td>{coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString("en-PK") : "No expiry"}</td>
                    <td>
                      <button className="edit-link" onClick={() => openEdit(coupon)}>
                        Edit
                      </button>{" "}
                      <button className="edit-link" disabled={busy} onClick={() => toggleActive(coupon)}>
                        {coupon.active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!coupons.length && (
            <div className="admin-empty">
              <h3>No coupons yet</h3>
              <p>Add your first discount code to start running promotions.</p>
            </div>
          )}
        </div>
      </div>

      {draft && (
        <div
          className="admin-drawer-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDrawer();
          }}
        >
          <aside className="admin-drawer">
            <header>
              <div>
                <p className="eyebrow">{draft.id ? "Edit coupon" : "New coupon"}</p>
                <h2>{draft.id ? draft.code : "Add a coupon"}</h2>
              </div>
              <button onClick={closeDrawer}>×</button>
            </header>

            <form onSubmit={save} className="admin-product-form">
              <div className="admin-form-grid">
                <label>
                  <span>Code</span>
                  <input
                    required
                    value={draft.code}
                    onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
                    placeholder="WELCOME10"
                  />
                </label>
                <label>
                  <span>Type</span>
                  <select
                    value={draft.type}
                    onChange={(event) => setDraft({ ...draft, type: event.target.value as CouponType })}
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed amount (PKR)</option>
                  </select>
                </label>
                <label className="field-wide">
                  <span>Description</span>
                  <input
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    placeholder="Welcome discount for new customers"
                  />
                </label>
                <label>
                  <span>{draft.type === "percentage" ? "Percentage off" : "Amount off (PKR)"}</span>
                  <input
                    required
                    type="number"
                    min="1"
                    max={draft.type === "percentage" ? 100 : undefined}
                    value={draft.value}
                    onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                  />
                </label>
                <label>
                  <span>Minimum order amount (PKR)</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.minOrderAmount}
                    onChange={(event) => setDraft({ ...draft, minOrderAmount: event.target.value })}
                  />
                </label>
                {draft.type === "percentage" && (
                  <label>
                    <span>Max discount cap (PKR, optional)</span>
                    <input
                      type="number"
                      min="1"
                      value={draft.maxDiscountAmount}
                      onChange={(event) => setDraft({ ...draft, maxDiscountAmount: event.target.value })}
                      placeholder="Uncapped"
                    />
                  </label>
                )}
                <label>
                  <span>Max redemptions (optional)</span>
                  <input
                    type="number"
                    min="1"
                    value={draft.maxRedemptions}
                    onChange={(event) => setDraft({ ...draft, maxRedemptions: event.target.value })}
                    placeholder="Unlimited"
                  />
                </label>
                <label>
                  <span>Starts at (optional)</span>
                  <input
                    type="datetime-local"
                    value={draft.startsAt}
                    onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
                  />
                </label>
                <label>
                  <span>Expires at (optional)</span>
                  <input
                    type="datetime-local"
                    value={draft.expiresAt}
                    onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })}
                  />
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={draft.appliesToDelivery}
                    onChange={(event) => setDraft({ ...draft, appliesToDelivery: event.target.checked })}
                  />
                  <span>Applies to delivery charge too</span>
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                  />
                  <span>Active</span>
                </label>
              </div>

              <footer>
                <button type="button" onClick={closeDrawer}>
                  Cancel
                </button>
                <button className="admin-primary" disabled={busy}>
                  {draft.id ? "Save coupon" : "Create coupon"}
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </section>
  );
}
