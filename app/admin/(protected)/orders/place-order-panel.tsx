"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

// "Place order for customer" (single) and "Bulk import (JSON)" for the admin order desk. Orders are
// created already confirmed, by the admin, through /api/admin/orders/place — see
// lib/admin-order-placement.ts for the rules (same stock/price/delivery rules as public checkout).

type Zone = { id: string; name: string; deliveryCharge: number; estimatedDaysMin: number; estimatedDaysMax: number };
type Variant = { id: string; sku: string; productName: string; variantName: string; price: number; available: number };
type Options = { zones: Zone[]; freeDeliveryThreshold: number; autoCourierBooking: boolean; variants: Variant[] };
// Outcome of the automatic PostEx booking that happens right after an order is placed.
type Courier =
  | { state: "booked"; trackingNumber: string }
  | { state: "created"; trackingNumber: string }
  | { state: "failed"; message: string; willRetry: boolean }
  | { state: "skipped" };
type Line = { variantId: string; quantity: number };

type PreviewRow =
  | { ok: true; customerName: string; city: string; itemsLabel: string; subtotal: number; deliveryCharge: number; discount: number; total: number }
  | { ok: false; customerName: string; city: string; errors: string[] };
type RowResult = { state: "waiting" | "placing" | "placed" | "failed"; orderNumber?: string; errors?: string[]; courier?: Courier };

export type PanelMode = "single" | "bulk";

const PROVINCES = ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Jammu and Kashmir"];
const money = (value: number) => `PKR ${value.toLocaleString("en-PK")}`;
const digits = (value: string) => value.replace(/\D/g, "");

const TEMPLATE_URL = "/api/admin/orders/place/template";

/** One-line description of the courier outcome, or "" when there's nothing to say (booking is off). */
function courierText(courier: Courier | undefined): string {
  if (!courier || courier.state === "skipped") return "";
  if (courier.state === "booked") return `PostEx booked — tracking ${courier.trackingNumber}`;
  if (courier.state === "created") return `PostEx parcel created (tracking ${courier.trackingNumber}) — pickup booking completes automatically`;
  return `PostEx NOT booked: ${courier.message} ${courier.willRetry ? "It will be retried automatically." : "Fix the details and use “Book with PostEx” in the order drawer."}`;
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  return { response, data };
}

export function PlaceOrderPanel({
  initialMode,
  onClose,
  onPlaced,
}: {
  initialMode: PanelMode;
  onClose: () => void;
  onPlaced: (message: string) => void;
}) {
  const [mode, setMode] = useState<PanelMode>(initialMode);
  const [options, setOptions] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState("");
  // True while orders are being written — the panel can't be dismissed mid-way, so a half-finished
  // bulk run is never left running unseen.
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/orders/place/options", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw new Error(data?.error ?? "Could not load products and delivery zones.");
        if (!cancelled) setOptions(data as Options);
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function close() {
    if (!working) onClose();
  }

  return (
    <div
      className="admin-drawer-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside className="admin-drawer">
        <header>
          <div>
            <p className="eyebrow">Orders</p>
            <h2>{mode === "single" ? "Place order for customer" : "Bulk import orders"}</h2>
          </div>
          <button onClick={close} disabled={working} aria-label="Close">
            ×
          </button>
        </header>

        <div className="order-filters" style={{ marginTop: 18 }}>
          <button type="button" className={mode === "single" ? "active" : ""} disabled={working} onClick={() => setMode("single")}>
            One order
          </button>
          <button type="button" className={mode === "bulk" ? "active" : ""} disabled={working} onClick={() => setMode("bulk")}>
            Bulk (JSON file)
          </button>
        </div>
        <p>
          <small>
            Orders placed here are created as <strong>confirmed</strong>, in your name, and reserve stock immediately.
            {options?.autoCourierBooking ? " Like customer-confirmed orders, they are then booked with PostEx automatically." : ""}
          </small>
        </p>

        {loadError && <div className="admin-message" role="alert">{loadError}</div>}
        {!options && !loadError && <p><small>Loading products and delivery zones…</small></p>}

        {options && mode === "single" && <SingleOrderForm options={options} onPlaced={onPlaced} onClose={close} setWorking={setWorking} />}
        {options && mode === "bulk" && <BulkImport onPlaced={onPlaced} onClose={close} working={working} setWorking={setWorking} />}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// One order
// ---------------------------------------------------------------------------------------------

function SingleOrderForm({
  options,
  onPlaced,
  onClose,
  setWorking,
}: {
  options: Options;
  onPlaced: (message: string) => void;
  onClose: () => void;
  setWorking: (value: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "bank_deposit">("cod");
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid">("pending");
  const [deliveryOverride, setDeliveryOverride] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [placed, setPlaced] = useState<{ orderNumber: string; total: number; courier?: Courier } | null>(null);
  // One key per order being entered: if a submit is retried or double-clicked, the server returns
  // the order the first attempt created instead of making a second one. Renewed per new order.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const variantById = useMemo(() => new Map(options.variants.map((variant) => [variant.id, variant])), [options.variants]);
  const zone = options.zones.find((candidate) => candidate.id === zoneId);

  const subtotal = lines.reduce((sum, line) => sum + (variantById.get(line.variantId)?.price ?? 0) * line.quantity, 0);
  const delivery = deliveryOverride !== "" ? Number(deliveryOverride) : subtotal >= options.freeDeliveryThreshold ? 0 : (zone?.deliveryCharge ?? 0);
  const discountValue = discount !== "" ? Number(discount) : 0;
  const total = Math.max(0, subtotal + delivery - discountValue);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return options.variants.filter((variant) => `${variant.productName} ${variant.variantName} ${variant.sku}`.toLowerCase().includes(needle)).slice(0, 8);
  }, [query, options.variants]);

  function addVariant(variant: Variant) {
    setLines((current) => {
      const existing = current.find((line) => line.variantId === variant.id);
      if (existing) return current.map((line) => (line.variantId === variant.id ? { ...line, quantity: Math.min(variant.available, line.quantity + 1) } : line));
      return [...current, { variantId: variant.id, quantity: 1 }];
    });
    setQuery("");
  }

  function reset() {
    setName("");
    setPhone("");
    setEmail("");
    setCity("");
    setProvince("");
    setAddress("");
    setPaymentMethod("cod");
    setPaymentStatus("pending");
    setDeliveryOverride("");
    setDiscount("");
    setNotes("");
    setLines([]);
    setQuery("");
    setErrors([]);
    setPlaced(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!lines.length) {
      setErrors(["Add at least one product to the order."]);
      return;
    }
    setBusy(true);
    setWorking(true);
    setErrors([]);
    try {
      const { response, data } = await postJson("/api/admin/orders/place", {
        idempotencyKey,
        order: {
          customerName: name,
          customerPhone: phone,
          customerEmail: email.trim() || undefined,
          city,
          province,
          address,
          zoneId,
          paymentMethod,
          paymentStatus,
          deliveryCharge: deliveryOverride !== "" ? Number(deliveryOverride) : undefined,
          discount: discount !== "" ? Number(discount) : undefined,
          notes: notes.trim() || undefined,
          items: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        },
      });
      if (!response.ok) {
        setErrors(data?.errors ?? [data?.error ?? "The order could not be placed."]);
        return;
      }
      setPlaced({ orderNumber: data.order.orderNumber, total: data.order.total, courier: data.order.courier });
      onPlaced(`Order ${data.order.orderNumber} placed and confirmed — ${money(data.order.total)}.${courierText(data.order.courier) ? ` ${courierText(data.order.courier)}.` : ""}`);
    } catch {
      setErrors(["Could not reach the server. Check your connection — the order was not placed unless it shows in the list; retrying is safe."]);
    } finally {
      setBusy(false);
      setWorking(false);
    }
  }

  if (placed) {
    return (
      <div className="admin-product-form">
        <p>
          <strong>Order {placed.orderNumber}</strong> was placed and confirmed — {money(placed.total)}.
        </p>
        {courierText(placed.courier) && (
          <p>
            <small>{courierText(placed.courier)}</small>
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button type="button" className="admin-primary" onClick={reset}>
            Place another order
          </button>
        </footer>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="admin-product-form">
      <div className="admin-form-grid">
        <label>
          <span>Customer name *</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>Phone / WhatsApp *</span>
          <input required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="03001234567" />
        </label>
        <label className="field-wide">
          <span>Email (optional)</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field-wide">
          <span>Delivery address *</span>
          <textarea required rows={3} value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label>
          <span>City *</span>
          <input required value={city} onChange={(event) => setCity(event.target.value)} />
        </label>
        <label>
          <span>Province *</span>
          <select required value={province} onChange={(event) => setProvince(event.target.value)}>
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
            <option value="" disabled>
              Choose delivery zone
            </option>
            {options.zones.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {money(item.deliveryCharge)} · {item.estimatedDaysMin}–{item.estimatedDaysMax} days
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="product-operations">
        <div>
          <p className="eyebrow">Products</p>
          <div className="admin-form-grid" style={{ marginTop: 14, gridTemplateColumns: "1fr" }}>
            <label>
              <span>Search by name or SKU</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. azure, or a SKU" />
            </label>
          </div>
          {matches.map((variant) => (
            <p key={variant.id}>
              <button type="button" className="edit-link" disabled={variant.available < 1} onClick={() => addVariant(variant)}>
                + {variant.productName}
                {variant.variantName !== variant.productName ? ` — ${variant.variantName}` : ""}
              </button>
              <small>
                {" "}
                {variant.sku} · {money(variant.price)} · {variant.available > 0 ? `${variant.available} in stock` : "out of stock"}
              </small>
            </p>
          ))}
          {query.trim() && !matches.length && <p><small>No sellable product matches “{query}”.</small></p>}

          {lines.length > 0 && (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const variant = variantById.get(line.variantId);
                    if (!variant) return null;
                    return (
                      <tr key={line.variantId}>
                        <td>
                          <strong>{variant.productName}</strong>
                          <small>
                            {variant.variantName !== variant.productName ? `${variant.variantName} · ` : ""}
                            {variant.sku} · {variant.available} available
                          </small>
                        </td>
                        <td>{money(variant.price)}</td>
                        <td>
                          <input
                            style={{ width: 64, padding: 8, border: "1px solid #d8cec4", background: "white", font: "12px inherit" }}
                            inputMode="numeric"
                            value={line.quantity}
                            onChange={(event) => {
                              const next = Math.min(variant.available, Math.max(1, Number(digits(event.target.value)) || 1));
                              setLines((current) => current.map((item) => (item.variantId === line.variantId ? { ...item, quantity: next } : item)));
                            }}
                          />
                        </td>
                        <td>{money(variant.price * line.quantity)}</td>
                        <td>
                          <button type="button" className="edit-link" onClick={() => setLines((current) => current.filter((item) => item.variantId !== line.variantId))}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <p className="eyebrow">Payment &amp; totals</p>
          <div className="admin-form-grid" style={{ marginTop: 14 }}>
            <label>
              <span>Payment method</span>
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "cod" | "bank_deposit")}>
                <option value="cod">Cash on delivery</option>
                <option value="bank_deposit">Bank deposit</option>
              </select>
            </label>
            <label>
              <span>Payment status</span>
              <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as "pending" | "paid")}>
                <option value="pending">Pending (collect on delivery / awaiting deposit)</option>
                <option value="paid">Already paid</option>
              </select>
            </label>
            <label>
              <span>Delivery charge (PKR) — optional</span>
              <input
                inputMode="numeric"
                value={deliveryOverride}
                onChange={(event) => setDeliveryOverride(digits(event.target.value))}
                placeholder={zone ? `Default ${money(subtotal >= options.freeDeliveryThreshold ? 0 : zone.deliveryCharge)}` : "Choose a zone first"}
              />
            </label>
            <label>
              <span>Discount (PKR) — optional</span>
              <input inputMode="numeric" value={discount} onChange={(event) => setDiscount(digits(event.target.value))} placeholder="0" />
            </label>
            <label className="field-wide">
              <span>Order note (optional)</span>
              <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </div>
          <p>
            Subtotal {money(subtotal)} · Delivery {money(delivery)}
            {discountValue > 0 ? ` · Discount −${money(discountValue)}` : ""} · <strong>Total {money(total)}</strong>
          </p>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="admin-message" role="alert">
          <span>
            {errors.map((message) => (
              <span key={message} style={{ display: "block" }}>
                {message}
              </span>
            ))}
          </span>
        </div>
      )}

      <footer>
        <button type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="admin-primary" disabled={busy || !lines.length}>
          {busy ? "Placing…" : "Place confirmed order"}
        </button>
      </footer>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------------------------

function BulkImport({
  onPlaced,
  onClose,
  working,
  setWorking,
}: {
  onPlaced: (message: string) => void;
  onClose: () => void;
  working: boolean;
  setWorking: (value: boolean) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [orders, setOrders] = useState<unknown[]>([]);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [finished, setFinished] = useState(false);

  async function onFile(file: File | undefined) {
    setParseError("");
    setPreview(null);
    setResults([]);
    setFinished(false);
    setOrders([]);
    if (!file) return;
    setFileName(file.name);
    if (file.size > 2_000_000) {
      setParseError("That file is too large (over 2 MB).");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch (error) {
      setParseError(`That file isn't valid JSON — ${error instanceof Error ? error.message : "it couldn't be read"}.`);
      return;
    }
    const list = Array.isArray(parsed) ? parsed : (parsed as { orders?: unknown })?.orders;
    if (!Array.isArray(list)) {
      setParseError('The file must be a list of orders, or an object with an "orders" list (like the template).');
      return;
    }
    setChecking(true);
    try {
      const { response, data } = await postJson("/api/admin/orders/place/preview", { orders: list });
      if (!response.ok) {
        setParseError(data?.error ?? "The file could not be checked.");
        return;
      }
      setOrders(list);
      setPreview(data.results as PreviewRow[]);
      setKeys(list.map(() => crypto.randomUUID()));
      setResults(list.map(() => ({ state: "waiting" })));
    } catch {
      setParseError("Could not reach the server to check the file.");
    } finally {
      setChecking(false);
    }
  }

  const validCount = preview?.filter((row) => row.ok).length ?? 0;
  const placedCount = results.filter((result) => result.state === "placed").length;
  const failedCount = results.filter((result) => result.state === "failed").length;

  async function placeAll() {
    if (!preview || working) return;
    setWorking(true);
    setFinished(false);
    const targets = preview.map((row, index) => ({ row, index })).filter(({ row, index }) => row.ok && results[index]?.state !== "placed");
    let placedNow = 0;
    try {
      for (const { index } of targets) {
        setResults((current) => current.map((result, i) => (i === index ? { state: "placing" } : result)));
        try {
          const { response, data } = await postJson("/api/admin/orders/place", { order: orders[index], idempotencyKey: keys[index] });
          const next: RowResult = response.ok
            ? { state: "placed", orderNumber: data.order.orderNumber, courier: data.order.courier }
            : { state: "failed", errors: data?.errors ?? [data?.error ?? "The order could not be placed."] };
          if (response.ok) placedNow++;
          setResults((current) => current.map((result, i) => (i === index ? next : result)));
        } catch {
          setResults((current) =>
            current.map((result, i) => (i === index ? { state: "failed", errors: ["Network problem — retrying this one is safe, it won't be duplicated."] } : result)),
          );
        }
      }
    } finally {
      setWorking(false);
      setFinished(true);
      if (placedNow > 0) onPlaced(`Bulk import: ${placedNow} order${placedNow === 1 ? "" : "s"} placed and confirmed.`);
    }
  }

  return (
    <div className="admin-product-form">
      <div className="product-operations">
        <div>
          <p className="eyebrow">1 · Get the template</p>
          <p>
            <small>
              Download the template, fill in your orders (it lists your real delivery zones and example SKUs), then upload it below. Nothing is placed until you
              review the check and confirm.
            </small>
          </p>
          <div className="admin-top-actions">
            <button type="button" onClick={() => window.location.assign(TEMPLATE_URL)}>
              Download order_place_template.json
            </button>
          </div>
        </div>

        <div>
          <p className="eyebrow">2 · Upload your file</p>
          <div className="admin-form-grid" style={{ marginTop: 14, gridTemplateColumns: "1fr" }}>
            <label>
              <span>JSON file</span>
              <input type="file" accept=".json,application/json" disabled={working || checking} onChange={(event) => void onFile(event.target.files?.[0])} />
            </label>
          </div>
          {checking && <p><small>Checking {fileName}…</small></p>}
          {parseError && <div className="admin-message" role="alert">{parseError}</div>}
        </div>

        {preview && (
          <div>
            <p className="eyebrow">3 · Review &amp; place</p>
            <p>
              <strong>{fileName}</strong> — {preview.length} order{preview.length === 1 ? "" : "s"}: {validCount} ready
              {preview.length - validCount > 0 ? `, ${preview.length - validCount} with problems (they will be skipped)` : ""}.
              {(placedCount > 0 || failedCount > 0) && ` Placed so far: ${placedCount}${failedCount ? `, failed: ${failedCount}` : ""}.`}
            </p>
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, index) => {
                    const result = results[index];
                    return (
                      <tr key={index}>
                        <td>{index + 1}</td>
                        <td>
                          <strong>{row.customerName || "—"}</strong>
                          <small>{row.city}</small>
                        </td>
                        <td>{row.ok ? row.itemsLabel : "—"}</td>
                        <td>{row.ok ? money(row.total) : "—"}</td>
                        <td>
                          {!row.ok && (
                            <>
                              <strong>Skipped — fix this order</strong>
                              {row.errors.map((message) => (
                                <small key={message}>{message}</small>
                              ))}
                            </>
                          )}
                          {row.ok && result?.state === "waiting" && "Ready"}
                          {row.ok && result?.state === "placing" && "Placing…"}
                          {row.ok && result?.state === "placed" && (
                            <>
                              <strong>Placed · {result.orderNumber}</strong>
                              {courierText(result.courier) && <small>{courierText(result.courier)}</small>}
                            </>
                          )}
                          {row.ok && result?.state === "failed" && (
                            <>
                              <strong>Not placed</strong>
                              {result.errors?.map((message) => (
                                <small key={message}>{message}</small>
                              ))}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <footer>
        <button type="button" onClick={onClose} disabled={working}>
          {finished ? "Done" : "Cancel"}
        </button>
        {preview && validCount - placedCount > 0 && (
          <button type="button" className="admin-primary" disabled={working} onClick={placeAll}>
            {working ? "Placing orders…" : failedCount > 0 ? `Retry ${validCount - placedCount} not placed` : `Place ${validCount} confirmed order${validCount === 1 ? "" : "s"}`}
          </button>
        )}
      </footer>
    </div>
  );
}
