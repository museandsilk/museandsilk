// Server-safe building blocks shared by every admin screen (no client JS).

import Link from "next/link";
import type { ReactNode } from "react";
import { cdnSrcForWidth, isCdnUrl } from "@/lib/media-url";
import { STATUS_INFO, REFUND_STATUS_INFO, type Tone } from "@/lib/order-rules";
import { Icon, type IconName } from "./icons";

export const pkr = (amount: number | null | undefined): string => `PKR ${Math.round(Number(amount ?? 0)).toLocaleString("en-PK")}`;

export const num = (n: number | null | undefined): string => Number(n ?? 0).toLocaleString("en-PK");

/** "5 min ago", "Yesterday, 3:20 pm", "12 Oct" – friendlier than a timestamp. */
export function when(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const time = d.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" });
  const hours = Math.round(min / 60);
  if (hours < 12) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const dayKey = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  if (dayKey(d) === dayKey(new Date())) return `Today, ${time}`;
  if (dayKey(d) === dayKey(new Date(Date.now() - 86_400_000))) return `Yesterday, ${time}`;
  return d.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric", timeZone: "Asia/Karachi" });
}

export function fullDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" });
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="a-head">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {actions && <div className="a-head-actions">{actions}</div>}
    </header>
  );
}

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`a-badge tone-${tone}`}>{children}</span>;
}

export function OrderStatusBadge({ status, short = false }: { status: string; short?: boolean }) {
  const info = STATUS_INFO[status];
  return <Badge tone={info?.tone ?? "muted"}>{info ? (short ? info.short : info.label) : status}</Badge>;
}

export function RefundStatusBadge({ status }: { status: string }) {
  const info = REFUND_STATUS_INFO[status];
  return <Badge tone={info?.tone ?? "muted"}>{info?.label ?? status}</Badge>;
}

export function Stat({ label, value, note, hint }: { label: string; value: ReactNode; note?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="a-card a-stat">
      <span>
        {label}
        {hint}
      </span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

export function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="a-faint">no earlier data</span>;
  const change = ((now - before) / before) * 100;
  const up = change >= 0;
  return (
    <span className={up ? "a-delta-up" : "a-delta-down"}>
      {up ? "▲" : "▼"} {Math.abs(change).toFixed(0)}% <span className="a-faint" style={{ fontWeight: 400 }}>vs before</span>
    </span>
  );
}

export function EmptyState({ icon = "box", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="a-empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "good"; children: ReactNode }) {
  const icon: IconName = tone === "warn" ? "alert" : tone === "bad" ? "alert" : tone === "good" ? "checkCircle" : "info";
  return (
    <div className={`a-note ${tone === "info" ? "" : tone}`} role={tone === "bad" ? "alert" : undefined}>
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

export function Tabs({ items }: { items: Array<{ href: string; label: string; count?: number; active: boolean; hot?: boolean }> }) {
  return (
    <nav className="a-tabs" aria-label="Sections">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className={item.hot ? "hot" : undefined} prefetch={false}>
          {item.label}
          {item.count !== undefined && <span className="n">{item.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="a-pager">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="a-row">
        {page > 1 ? (
          <Link className="a-btn a-btn-sm" href={hrefFor(page - 1)} prefetch={false}>
            ← Newer
          </Link>
        ) : null}
        <span>
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link className="a-btn a-btn-sm" href={hrefFor(page + 1)} prefetch={false}>
            Older →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Small picture for lists: the 320px WebP variant when the image has one, never the full-size original. */
export const thumbSrc = (src: string | null | undefined): string | null => (src ? (isCdnUrl(src) ? cdnSrcForWidth(src, 320) : src) : null);

export function Thumb({ src, alt = "", square = false }: { src: string | null | undefined; alt?: string; square?: boolean }) {
  const small = thumbSrc(src);
  return (
    <span className={`a-thumb${square ? " sq" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {small ? <img src={small} alt={alt} loading="lazy" decoding="async" /> : null}
    </span>
  );
}
