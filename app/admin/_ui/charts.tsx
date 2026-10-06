// Tiny server-rendered SVG charts (no chart library, no client JavaScript).

import type { DayPoint, NamedValue } from "@/lib/admin/analytics";

const compact = (n: number): string => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(Math.round(n)));

function niceMax(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= value) ?? 10;
  return step * magnitude;
}

export function SalesChart({ series }: { series: DayPoint[] }) {
  const width = 760;
  const height = 240;
  const pad = { l: 46, r: 8, t: 14, b: 30 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = niceMax(Math.max(...series.map((point) => point.sales), 0));
  const slot = innerW / Math.max(1, series.length);
  const barW = Math.max(3, Math.min(34, slot * 0.68));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.max(1, Math.ceil(series.length / 8));
  const total = series.reduce((sum, point) => sum + point.sales, 0);

  return (
    <svg className="a-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Sales per day. Total PKR ${Math.round(total).toLocaleString("en-PK")}.`}>
      {ticks.map((tick) => {
        const y = pad.t + innerH * (1 - tick);
        return (
          <g key={tick}>
            <line className="grid" x1={pad.l} x2={width - pad.r} y1={y} y2={y} />
            <text x={pad.l - 8} y={y + 4} textAnchor="end">
              {compact(max * tick)}
            </text>
          </g>
        );
      })}
      {series.map((point, index) => {
        const h = (point.sales / max) * innerH;
        const x = pad.l + slot * index + (slot - barW) / 2;
        return (
          <g key={point.day}>
            <rect className="bar" x={x} y={pad.t + innerH - h} width={barW} height={Math.max(point.sales > 0 ? 2 : 0, h)} rx="3">
              <title>{`${point.label}: PKR ${Math.round(point.sales).toLocaleString("en-PK")} · ${point.orders} order${point.orders === 1 ? "" : "s"}`}</title>
            </rect>
            {index % labelEvery === 0 && (
              <text x={x + barW / 2} y={height - 9} textAnchor="middle">
                {point.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function HourChart({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  const width = 480;
  const height = 120;
  const slot = width / 24;
  const best = hours.indexOf(Math.max(...hours));
  const label = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
  return (
    <svg className="a-chart" viewBox={`0 0 ${width} ${height + 22}`} role="img" aria-label={`Orders by hour of the day. Busiest around ${label(best)}.`}>
      {hours.map((count, h) => {
        const barH = (count / max) * (height - 10);
        return (
          <g key={h}>
            <rect className="bar" x={h * slot + 2} y={height - barH} width={slot - 4} height={Math.max(count > 0 ? 2 : 0, barH)} rx="2" opacity={h === best && count > 0 ? 1 : 0.55}>
              <title>{`${label(h)}: ${count} order${count === 1 ? "" : "s"}`}</title>
            </rect>
            {h % 3 === 0 && (
              <text x={h * slot + slot / 2} y={height + 16} textAnchor="middle">
                {label(h)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function HBars({ items, format, alt = false }: { items: NamedValue[]; format: (value: number) => string; alt?: boolean }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="a-hbar">
      {items.map((item) => (
        <div key={item.name}>
          <span title={item.name}>{item.name}</span>
          <span className="track">
            <span className={`fill${alt ? " alt" : ""}`} style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }} />
          </span>
          <strong className="a-money">{format(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}
