import type { ReactNode } from "react";
import type { TourState } from "./engine";

/** Small building blocks that look like the real admin (same colours, same shapes), used to draw the pretend screens in each lesson. */

const NAV = ["Home", "Orders", "Refunds", "Products", "Stock", "Categories", "Flash sales", "Discount codes", "Website pictures", "Shop locations", "Delivery charges", "Settings", "Training"];

type S = { s: TourState };

/** A thing the pretend cursor can point at: `data-t` is how the player finds it. */
export function T({ id, s, children, className = "", as: Tag = "span", style }: S & { id: string; children?: ReactNode; className?: string; as?: "span" | "div"; style?: React.CSSProperties }) {
  return (
    <Tag data-t={id} className={`${className}${s.hl === id ? " m-hl" : ""}`} style={style}>
      {children}
    </Tag>
  );
}

export function Shell({ nav, title, intro, children }: { nav: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="m-shell">
      <div className="m-side" aria-hidden="true">
        <div className="m-brand">Nure Asmir</div>
        {NAV.map((item) => (
          <div key={item} className={`m-nav${item === nav ? " on" : ""}`}>
            {item}
          </div>
        ))}
      </div>
      <div className="m-page">
        <div className="m-title">{title}</div>
        {intro && <div className="m-intro">{intro}</div>}
        {children}
      </div>
    </div>
  );
}

export function Btn({ id, s, children, primary, quiet }: S & { id: string; children: ReactNode; primary?: boolean; quiet?: boolean }) {
  return (
    <T id={id} s={s} className={`m-btn${primary ? " primary" : ""}${quiet ? " quiet" : ""}`}>
      {children}
    </T>
  );
}

/** A text box that shows what has been typed so far (state key `k`) or its placeholder. */
export function Field({ id, s, k, label, placeholder, wide, w }: S & { id: string; k: string; label?: string; placeholder?: string; wide?: boolean; w?: number }) {
  const value = s[k];
  return (
    <div className="m-field" style={{ gridColumn: wide ? "1 / -1" : undefined, width: w }}>
      {label && <div className="m-label">{label}</div>}
      <T id={id} s={s} as="div" className={`m-input${value ? " filled" : ""}${s.hl === id && !value ? " focus" : ""}`}>
        {value || <span className="ph">{placeholder}</span>}
        {s.hl === id && value !== undefined && <i className="caret" />}
      </T>
    </div>
  );
}

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="m-card">
      {title && (
        <div className="m-card-head">
          <strong>{title}</strong>
          {right}
        </div>
      )}
      <div className="m-card-body">{children}</div>
    </div>
  );
}

export function Chip({ children, on, id, s }: { children: ReactNode; on?: boolean; id?: string; s?: TourState }) {
  return id && s ? (
    <T id={id} s={s} className={`m-chip${on ? " on" : ""}`}>
      {children}
    </T>
  ) : (
    <span className={`m-chip${on ? " on" : ""}`}>{children}</span>
  );
}

export function Badge({ tone, children }: { tone: "new" | "work" | "ship" | "done" | "bad" | "muted"; children: ReactNode }) {
  return <span className={`m-badge ${tone}`}>{children}</span>;
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="m-table">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Tip({ children }: { children: ReactNode }) {
  return <div className="m-tip">{children}</div>;
}

export function Grid({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return <div className="m-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>{children}</div>;
}
