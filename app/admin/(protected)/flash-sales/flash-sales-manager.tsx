"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLockedAction } from "@/lib/use-locked-action";

type Sale = {
  id: string;
  name: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  appliesToAll: boolean;
  productIds: string[];
};
type ProductOption = { id: string; name: string };

type Draft = {
  id: string;
  name: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  appliesToAll: boolean;
  productIds: string[];
};

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(value: string | Date): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function emptyDraft(): Draft {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { id: "", name: "", discountType: "percent", discountValue: "20", startsAt: toLocalInput(start), endsAt: toLocalInput(end), active: true, appliesToAll: false, productIds: [] };
}
function status(sale: Sale): { label: string; className: string } {
  const now = Date.now();
  if (!sale.active) return { label: "Disabled", className: "status-archived" };
  if (new Date(sale.endsAt).getTime() <= now) return { label: "Ended", className: "status-archived" };
  if (new Date(sale.startsAt).getTime() > now) return { label: "Scheduled", className: "status-draft" };
  return { label: "Live", className: "status-published" };
}

export function FlashSalesManager() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const saveAction = useLockedAction();
  const rowAction = useLockedAction();

  const load = useCallback(async () => {
    const [salesRes, productsRes] = await Promise.all([fetch("/api/admin/flash-sales"), fetch("/api/admin/products")]);
    if (salesRes.ok) setSales(((await salesRes.json()) as { sales: Sale[] }).sales);
    if (productsRes.ok) {
      const data = (await productsRes.json()) as { products: Array<{ id: string; name: string }> };
      setProducts(data.products.map((product) => ({ id: product.id, name: product.name })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial data load on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const visibleProducts = useMemo(() => products.filter((product) => product.name.toLowerCase().includes(filter.toLowerCase())), [products, filter]);

  function editSale(sale: Sale) {
    setDraft({
      id: sale.id,
      name: sale.name,
      discountType: sale.discountType,
      discountValue: String(sale.discountValue),
      startsAt: toLocalInput(sale.startsAt),
      endsAt: toLocalInput(sale.endsAt),
      active: sale.active,
      appliesToAll: sale.appliesToAll,
      productIds: sale.productIds,
    });
    setMessage("");
  }

  async function save() {
    if (!draft) return;
    await saveAction.run(async () => {
      const body = {
        name: draft.name,
        discountType: draft.discountType,
        discountValue: Number(draft.discountValue),
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        active: draft.active,
        appliesToAll: draft.appliesToAll,
        productIds: draft.appliesToAll ? [] : draft.productIds,
      };
      const response = await fetch(draft.id ? `/api/admin/flash-sales/${draft.id}` : "/api/admin/flash-sales", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Could not save the sale.");
        return;
      }
      setDraft(null);
      setMessage("Sale saved. Prices update on the storefront within a couple of minutes.");
      await load();
    });
  }

  async function toggle(sale: Sale) {
    await rowAction.run(async () => {
      const response = await fetch(`/api/admin/flash-sales/${sale.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sale, active: !sale.active }),
      });
      if (!response.ok) setMessage("Could not update the sale.");
      await load();
    });
  }

  async function remove(sale: Sale) {
    if (!window.confirm(`Delete the sale "${sale.name}"?`)) return;
    await rowAction.run(async () => {
      const response = await fetch(`/api/admin/flash-sales/${sale.id}`, { method: "DELETE" });
      if (!response.ok) setMessage("Could not delete the sale.");
      await load();
    });
  }

  return (
    <section className="admin-main">
      <header className="admin-topbar">
        <div>
          <h1>Flash sales</h1>
          <p className="a-muted" style={{ marginTop: 5, maxWidth: 680 }}>A discount that starts and ends by itself at the times you choose. Customers see the lower price and a countdown. People who saved the item get an alert.</p>
        </div>
        <div className="admin-top-actions">
          <button type="button" onClick={() => setDraft(emptyDraft())}>
            New sale
          </button>
        </div>
      </header>
      {message && (
        <p className="admin-message">
          {message}
          <button type="button" onClick={() => setMessage("")} aria-label="Dismiss">
            ×
          </button>
        </p>
      )}

      {draft && (
        <div className="admin-settings-card">
          <h2>{draft.id ? "Edit sale" : "New sale"}</h2>
          <div className="admin-form-grid">
            <label className="field-wide">
              <span>Name (shown to shoppers)</span>
              <input value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Eid flash sale" />
            </label>
            <label>
              <span>Discount type</span>
              <select value={draft.discountType} onChange={(e) => setDraft({ ...draft, discountType: e.target.value as Draft["discountType"] })}>
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount off (PKR)</option>
              </select>
            </label>
            <label>
              <span>{draft.discountType === "percent" ? "Percent (1–90)" : "Rs. off each item"}</span>
              <input type="number" min={1} value={draft.discountValue} onChange={(e) => setDraft({ ...draft, discountValue: e.target.value })} />
            </label>
            <label>
              <span>Starts</span>
              <input type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
            </label>
            <label>
              <span>Ends</span>
              <input type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} />
            </label>
            <label className="admin-check">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              <span>Active</span>
            </label>
            <label className="admin-check">
              <input type="checkbox" checked={draft.appliesToAll} onChange={(e) => setDraft({ ...draft, appliesToAll: e.target.checked })} />
              <span>Applies to every product</span>
            </label>
            {!draft.appliesToAll && (
              <div className="field-wide">
                <input placeholder="Filter products…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <div className="flash-product-list">
                  {visibleProducts.map((product) => (
                    <label key={product.id} className="admin-check">
                      <input
                        type="checkbox"
                        checked={draft.productIds.includes(product.id)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            productIds: e.target.checked ? [...draft.productIds, product.id] : draft.productIds.filter((id) => id !== product.id),
                          })
                        }
                      />
                      <span>{product.name}</span>
                    </label>
                  ))}
                </div>
                <small>{draft.productIds.length} selected</small>
              </div>
            )}
          </div>
          <div className="admin-top-actions" style={{ marginTop: 20 }}>
            <button type="button" className="admin-primary" disabled={saveAction.pending} onClick={save}>
              {saveAction.pending ? (
                <span className="busy-label">
                  <i className="spinner spinner-light" /> Saving…
                </span>
              ) : (
                "Save sale"
              )}
            </button>
            <button type="button" disabled={saveAction.pending} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="admin-table-card" style={{ marginTop: 24 }}>
        <div className="admin-table-tools">
          <h2>All sales</h2>
          <span>{sales.length} total</span>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sale</th>
                <th>Discount</th>
                <th>Window</th>
                <th>Applies to</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6}>Loading…</td>
                </tr>
              )}
              {!loading && !sales.length && (
                <tr>
                  <td colSpan={6}>No sales yet — create one to run a limited-time discount.</td>
                </tr>
              )}
              {sales.map((sale) => {
                const st = status(sale);
                return (
                  <tr key={sale.id}>
                    <td>{sale.name}</td>
                    <td>{sale.discountType === "percent" ? `${sale.discountValue}% off` : `Rs. ${sale.discountValue.toLocaleString("en-PK")} off`}</td>
                    <td>
                      {new Date(sale.startsAt).toLocaleString()}
                      <small>→ {new Date(sale.endsAt).toLocaleString()}</small>
                    </td>
                    <td>{sale.appliesToAll ? "Everything" : `${sale.productIds.length} product(s)`}</td>
                    <td>
                      <span className={`status-pill ${st.className}`}>{st.label}</span>
                    </td>
                    <td>
                      <button type="button" className="edit-link" disabled={rowAction.pending} onClick={() => editSale(sale)}>
                        Edit
                      </button>{" "}
                      <button type="button" className="edit-link" disabled={rowAction.pending} onClick={() => toggle(sale)}>
                        {sale.active ? "Disable" : "Enable"}
                      </button>{" "}
                      <button type="button" className="edit-link" disabled={rowAction.pending} onClick={() => remove(sale)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
