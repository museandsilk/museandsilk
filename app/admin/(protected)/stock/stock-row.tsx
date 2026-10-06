"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLockedAction } from "@/lib/use-locked-action";
import { callApi, useToast } from "../../_ui/client";
import { Badge, Thumb } from "../../_ui/ui";

export type StockRowData = { id: string; productId: string; product: string; size: string | null; sku: string; price: number; stock: number; reserved: number; low: number; status: string; image: string | null };

export function StockRow({ row }: { row: StockRowData }) {
  const router = useRouter();
  const toast = useToast();
  const action = useLockedAction();
  const [stock, setStock] = useState(String(row.stock));
  const [price, setPrice] = useState(String(row.price));
  const changed = stock !== String(row.stock) || price !== String(row.price);
  const available = Math.max(0, Number(stock || 0) - row.reserved);

  async function save() {
    await action.run(async () => {
      const result = await callApi(`/api/admin/variants/${row.id}`, "PATCH", { stockQuantity: Number(stock || 0), price: Number(price || 0) });
      if (result.ok) {
        toast(`${row.product}${row.size ? ` (${row.size})` : ""} saved.`, "good");
        router.refresh();
      } else toast(result.error, "bad");
    });
  }

  return (
    <tr className={changed ? "is-selected" : undefined}>
      <td>
        <Link href={`/admin/products/${row.productId}`} className="a-prodcell">
          <Thumb src={row.image} square />
          <span>
            <strong>{row.product}</strong>
            <small>{row.sku}</small>
          </span>
        </Link>
      </td>
      <td>{row.size || "—"}</td>
      <td style={{ width: 130 }}>
        <input aria-label={`Price for ${row.product} ${row.size ?? ""}`} value={price} onChange={(event) => setPrice(event.target.value.replace(/\D/g, ""))} inputMode="numeric" />
      </td>
      <td style={{ width: 150 }}>
        <div className="a-row" style={{ gap: 4, flexWrap: "nowrap" }}>
          <button type="button" className="a-btn a-btn-sm" aria-label="One less" onClick={() => setStock(String(Math.max(0, Number(stock || 0) - 1)))}>
            −
          </button>
          <input aria-label={`Stock for ${row.product} ${row.size ?? ""}`} value={stock} onChange={(event) => setStock(event.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ textAlign: "center", minWidth: 60 }} />
          <button type="button" className="a-btn a-btn-sm" aria-label="One more" onClick={() => setStock(String(Number(stock || 0) + 1))}>
            +
          </button>
        </div>
      </td>
      <td>{row.reserved || "—"}</td>
      <td>{available <= 0 ? <Badge tone="bad">Sold out</Badge> : available <= row.low ? <Badge tone="new">{available} left</Badge> : <span>{available}</span>}</td>
      <td style={{ textAlign: "right", width: 96 }}>
        {changed && (
          <button type="button" className="a-btn a-btn-primary a-btn-sm" onClick={save} disabled={action.pending} aria-busy={action.pending}>
            {action.pending ? <span className="spinner spinner-light" aria-hidden="true" /> : null} Save
          </button>
        )}
      </td>
    </tr>
  );
}
