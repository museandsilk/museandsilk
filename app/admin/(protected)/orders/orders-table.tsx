"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLockedAction } from "@/lib/use-locked-action";
import type { OrderListRow } from "@/lib/admin/orders-query";
import { ApiButton, callApi, Dialog, useToast } from "../../_ui/client";
import { Icon } from "../../_ui/icons";
import { Badge, OrderStatusBadge, Thumb, pkr, when } from "../../_ui/ui";

type Row = Omit<OrderListRow, "createdAt" | "handedOverAt"> & { createdAt: string; handedOverAt: string | null };

function nextStep(row: Row) {
  const hasTracking = Boolean(row.courierTrackingNumber) && row.courierTrackingNumber !== "PENDING";
  switch (row.orderStatus) {
    case "pending_confirmation":
      return { label: "Confirm", url: `/api/admin/orders/${row.id}/status`, body: { toStatus: "confirmed" }, done: "Order confirmed. The customer has been told." };
    case "confirmed":
    case "processing":
    case "packed":
      return hasTracking
        ? { label: "TCS collected it", url: `/api/admin/orders/${row.id}/status`, body: { toStatus: "shipped" }, done: "Marked as with TCS." }
        : { label: "Book TCS", url: `/api/admin/orders/${row.id}/courier`, body: { action: "book" }, done: "Booked with TCS." };
    case "shipped":
      return { label: "Mark delivered", url: `/api/admin/orders/${row.id}/status`, body: { toStatus: "delivered" }, done: "Marked as delivered." };
    default:
      return null;
  }
}

export function OrdersTable({ rows, tab }: { rows: Row[]; tab: string }) {
  const router = useRouter();
  const toast = useToast();
  const bulk = useLockedAction();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<{ title: string; lines: Array<{ order: string; ok: boolean; message: string }> } | null>(null);

  const allPicked = rows.length > 0 && picked.size === rows.length;
  const pickedRows = useMemo(() => rows.filter((row) => picked.has(row.id)), [rows, picked]);
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function runBulk(action: "confirm" | "packed" | "book_tcs" | "tcs_collected", title: string) {
    await bulk.run(async () => {
      const result = await callApi<{ results: Array<{ id: string; ok: boolean; message: string }>; done: number; failed: number }>("/api/admin/orders/bulk", "POST", { ids: [...picked], action });
      if (!result.ok) {
        toast(result.error, "bad");
        return;
      }
      const names = new Map(rows.map((row) => [row.id, row.orderNumber]));
      setReport({ title, lines: result.data.results.map((line) => ({ order: names.get(line.id) ?? line.id, ok: line.ok, message: line.message })) });
      setPicked(new Set());
      router.refresh();
    });
  }

  return (
    <>
      {picked.size > 0 && (
        <div className="a-row" style={{ padding: "12px 18px", background: "var(--primary-soft)", borderBottom: "1px solid var(--line)" }} role="region" aria-label="Actions for ticked orders">
          <strong>{picked.size} order{picked.size === 1 ? "" : "s"} ticked</strong>
          <span className="a-spacer" />
          {(tab === "action" || tab === "all") && (
            <button type="button" className="a-btn a-btn-primary a-btn-sm" disabled={bulk.pending} onClick={() => runBulk("confirm", "Confirm orders")}>
              Confirm ticked
            </button>
          )}
          {(tab === "pack" || tab === "all") && (
            <>
              <button type="button" className="a-btn a-btn-primary a-btn-sm" disabled={bulk.pending} onClick={() => runBulk("book_tcs", "Book with TCS")} title="Gets a TCS tracking number for each ticked order">
                Book ticked with TCS
              </button>
              <button type="button" className="a-btn a-btn-sm" disabled={bulk.pending} onClick={() => runBulk("tcs_collected", "TCS collected")} title="Use this when TCS has taken the parcels. The orders can no longer be cancelled.">
                TCS collected them
              </button>
            </>
          )}
          <button type="button" className="a-btn a-btn-quiet a-btn-sm" disabled={bulk.pending} onClick={() => setPicked(new Set())}>
            Untick all
          </button>
          {bulk.pending && <span className="spinner" aria-label="Working" />}
        </div>
      )}
      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th className="check">
                <input type="checkbox" aria-label="Tick all orders on this page" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((row) => row.id)))} />
              </th>
              <th>Order</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Payment</th>
              <th className="num">Total</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Next step</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const step = nextStep(row);
              const tracking = row.courierTrackingNumber && row.courierTrackingNumber !== "PENDING" ? row.courierTrackingNumber : null;
              return (
                <tr key={row.id} className={picked.has(row.id) ? "is-selected" : undefined}>
                  <td className="check">
                    <input type="checkbox" aria-label={`Tick order ${row.orderNumber}`} checked={picked.has(row.id)} onChange={() => toggle(row.id)} />
                  </td>
                  <td>
                    <Link href={`/admin/orders/${row.id}`} className="a-strong" style={{ textDecoration: "underline", textUnderlineOffset: 3, whiteSpace: "nowrap" }}>
                      {row.orderNumber}
                    </Link>
                    <small>{when(row.createdAt)}</small>
                  </td>
                  <td>
                    <strong>{row.customerName}</strong>
                    <small>
                      {row.city} · {row.customerPhone}
                    </small>
                  </td>
                  <td>
                    <div className="a-prodcell">
                      <Thumb src={row.firstImage} square />
                      <span>
                        {row.pieces} item{row.pieces === 1 ? "" : "s"}
                        <small>{row.firstItem}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    {row.paymentMethod === "cod" ? "Cash on delivery" : "Bank transfer"}
                    <small>
                      {row.paymentStatus === "paid" ? "Paid" : row.paymentMethod === "cod" ? "Pay at the door" : "Not paid yet"}
                      {row.proofPending && " · receipt to check"}
                    </small>
                  </td>
                  <td className="num a-money">{pkr(row.total)}</td>
                  <td>
                    <OrderStatusBadge status={row.orderStatus} short />
                    {tracking && <small>TCS {tracking}</small>}
                    {row.refundStatus && row.refundStatus !== "refunded" && <Badge tone="new">Refund {row.refundStatus === "requested" ? "asked" : row.refundStatus}</Badge>}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {step ? <ApiButton url={step.url} body={step.body} label={step.label} busyLabel="Please wait…" success={step.done} size="sm" variant={row.orderStatus === "pending_confirmation" ? "primary" : "default"} /> : null}{" "}
                    <Link className="a-btn a-btn-sm a-btn-quiet" href={`/admin/orders/${row.id}`} aria-label={`Open order ${row.orderNumber}`}>
                      Open <Icon name="chevronRight" size={15} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pickedRows.length === 0 && rows.length > 0 && <p className="a-help" style={{ padding: "10px 18px" }}>Tip: tick the boxes on the left to do the same thing to several orders at once.</p>}
      {report && (
        <Dialog title={report.title} onClose={() => setReport(null)} wide>
          <p>
            {report.lines.filter((line) => line.ok).length} worked
            {report.lines.some((line) => !line.ok) ? `, ${report.lines.filter((line) => !line.ok).length} need your attention:` : "."}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8, maxHeight: 340, overflowY: "auto" }}>
            {report.lines.map((line) => (
              <li key={line.order} className="a-row">
                <Badge tone={line.ok ? "done" : "bad"}>{line.ok ? "Done" : "Problem"}</Badge>
                <strong>{line.order}</strong>
                <span className="a-muted">{line.message}</span>
              </li>
            ))}
          </ul>
          <div className="a-dialog-actions">
            <button type="button" className="a-btn a-btn-primary" onClick={() => setReport(null)}>
              OK
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
