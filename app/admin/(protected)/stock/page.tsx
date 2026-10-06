import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { mediaUrl } from "@/lib/media-url";
import { HelpBox } from "../../_ui/client";
import { Icon } from "../../_ui/icons";
import { EmptyState, PageHeader, Pager, Tabs } from "../../_ui/ui";
import { StockRow, type StockRowData } from "./stock-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock" };

const PAGE_SIZE = 40;
const SHOW = [
  { key: "all", label: "Everything" },
  { key: "low", label: "Running low" },
  { key: "out", label: "Sold out" },
] as const;

type Raw = { id: string; productId: string; product: string; size: string | null; sku: string; price: number; compareAt: number | null; stock: number; reserved: number; low: number; status: string; imageKey: string | null; widths: number[] | null };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string; page?: string }> }) {
  const params = await searchParams;
  const show = SHOW.find((item) => item.key === params.show)?.key ?? "all";
  const q = (params.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number(params.page) || 1);
  const like = `%${q.replace(/[%_]/g, "")}%`;

  const filter = sql`v.status = 'active' and p.status <> 'archived'
    ${q ? sql`and (p.name ilike ${like} or v.sku ilike ${like} or v.size ilike ${like})` : sql``}
    ${show === "low" ? sql`and v.stock_quantity - v.reserved_quantity between 1 and v.low_stock_threshold` : show === "out" ? sql`and v.stock_quantity - v.reserved_quantity <= 0` : sql``}`;

  const [rowsResult, countResult, totals] = await Promise.all([
    db.execute(sql`
      select v.id, p.id as "productId", p.name as product, v.size, v.sku, v.price, v.compare_at_price as "compareAt", v.stock_quantity as stock, v.reserved_quantity as reserved,
             v.low_stock_threshold as low, p.status,
             (select i.r2_key from product_images i where i.product_id = p.id and i.status = 'active' order by i.is_primary desc, i.sort_order limit 1) as "imageKey",
             (select i.variant_widths from product_images i where i.product_id = p.id and i.status = 'active' order by i.is_primary desc, i.sort_order limit 1) as widths
      from product_variants v join products p on p.id = v.product_id
      where ${filter}
      order by p.name, v.size
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`),
    db.execute(sql`select count(*)::int as n from product_variants v join products p on p.id = v.product_id where ${filter}`),
    db.execute(sql`
      select count(*) filter (where v.stock_quantity - v.reserved_quantity between 1 and v.low_stock_threshold)::int as low,
             count(*) filter (where v.stock_quantity - v.reserved_quantity <= 0)::int as out,
             count(*)::int as all
      from product_variants v join products p on p.id = v.product_id where v.status = 'active' and p.status <> 'archived'`),
  ]);
  const rows = ((rowsResult as unknown as { rows: Raw[] }).rows ?? []).map<StockRowData>((row) => ({ ...row, image: row.imageKey ? mediaUrl(row.imageKey, row.widths) : null }));
  const total = Number(((countResult as unknown as { rows: Array<{ n: number }> }).rows ?? [])[0]?.n ?? 0);
  const counts = ((totals as unknown as { rows: Array<{ low: number; out: number; all: number }> }).rows ?? [])[0] ?? { low: 0, out: 0, all: 0 };
  const href = (next: { show?: string; page?: number }) => {
    const search = new URLSearchParams();
    const s = next.show ?? show;
    if (s !== "all") search.set("show", s);
    if (q) search.set("q", q);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    const text = search.toString();
    return `/admin/stock${text ? `?${text}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Stock"
        intro="How many of each size you have, and its price. Change a number and press Save on that row."
        actions={
          <Link className="a-btn" href="/admin/products/bulk#update" title="Download all prices and stock as a sheet, change numbers in Excel, and upload it back">
            <Icon name="sheet" /> Update with Excel
          </Link>
        }
      />
      <HelpBox id="stock">
        <ol>
          <li><strong>In stock</strong> is what is on your shelf. <strong>Held</strong> is what is promised to customers who have ordered but not received yet.</li>
          <li>Change <strong>In stock</strong> or <strong>Price</strong>, then press <strong>Save</strong> on that row. Customers see it straight away.</li>
          <li>When a size reaches 0 it shows <strong>Sold out</strong> on your website by itself, and you get an alert when stock gets low.</li>
        </ol>
      </HelpBox>
      <Tabs items={SHOW.map((item) => ({ href: href({ show: item.key }), label: item.label, count: item.key === "all" ? counts.all : item.key === "low" ? counts.low : counts.out, active: item.key === show, hot: item.key !== "all" && (item.key === "low" ? counts.low : counts.out) > 0 }))} />
      <form method="get" action="/admin/stock" className="a-row" style={{ marginBottom: 14 }} role="search">
        {show !== "all" && <input type="hidden" name="show" value={show} />}
        <div style={{ flex: 1, maxWidth: 420 }}>
          <input name="q" defaultValue={q} placeholder="Find by product name, size or code…" aria-label="Find stock" />
        </div>
        <button className="a-btn">
          <Icon name="search" size={17} /> Find
        </button>
        {q && (
          <Link className="a-btn a-btn-quiet" href={href({})} prefetch={false}>
            Clear
          </Link>
        )}
      </form>
      <div className="a-card">
        {rows.length ? (
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Size</th>
                  <th>Price (PKR)</th>
                  <th>In stock</th>
                  <th>Held</th>
                  <th>For sale</th>
                  <th>
                    <span className="sr-only">Save</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <StockRow key={`${row.id}-${row.stock}-${row.price}`} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="grid" title={show === "all" && !q ? "No products yet" : "Nothing to show"}>
            {show === "low" ? "Nothing is running low. 🎉" : show === "out" ? "Nothing is sold out." : "Try a different search."}
          </EmptyState>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(next) => href({ page: next })} />
      </div>
    </>
  );
}
