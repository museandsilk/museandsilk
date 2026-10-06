"use client";

import { useEffect, useState } from "react";
import { pkr } from "../../_ui/ui";

export type PreviewColor = { name: string; photos: string[]; sizes: Array<{ size: string; price: number; compareAt: number | null; stock: number }> };
export type PreviewData = {
  name: string;
  type: string;
  shortDescription: string;
  description: string;
  care: string;
  material: string;
  badge: string;
  colors: PreviewColor[];
};

/**
 * "How customers will see it": the product page of the draft (nothing is saved), as it looks on a phone and on a laptop.
 * Colours and sizes can be tapped, like on the real page. It is a faithful sketch of the page – same order of things, same
 * wording for sold-out and prices – not a copy of the shop's CSS, so it never goes stale when the shop is restyled.
 */
export function ProductPreview({ data, initialColor, onClose }: { data: PreviewData; initialColor: number; onClose: () => void }) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [colorIndex, setColorIndex] = useState(Math.min(initialColor, Math.max(0, data.colors.length - 1)));
  const [photoIndex, setPhotoIndex] = useState(0);
  const [size, setSize] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const color = data.colors[colorIndex] ?? data.colors[0];
  const photos = color?.photos ?? [];
  const sizes = color?.sizes ?? [];
  const chosen = sizes.find((s) => s.size === size) ?? null;
  const shown = chosen ?? sizes[0] ?? null;
  const allOut = sizes.length > 0 && sizes.every((s) => s.stock <= 0);
  const desktop = device === "desktop";
  const width = desktop ? 980 : 375;

  const pick = (index: number) => {
    setColorIndex(index);
    setPhotoIndex(0);
    setSize("");
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Preview of the product page" style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", gridTemplateRows: "auto 1fr", background: "rgba(10,10,10,.62)" }}>
      <header className="a-row" style={{ justifyContent: "space-between", padding: "12px 20px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <strong>How customers will see this product</strong>
        <div className="a-range" role="group" aria-label="Screen size">
          <button type="button" aria-pressed={!desktop} aria-current={!desktop ? "page" : undefined} onClick={() => setDevice("mobile")}>
            Phone
          </button>
          <button type="button" aria-pressed={desktop} aria-current={desktop ? "page" : undefined} onClick={() => setDevice("desktop")}>
            Laptop
          </button>
        </div>
        <button type="button" className="a-btn" onClick={onClose}>
          Close preview
        </button>
      </header>
      <div style={{ overflow: "auto", padding: "24px 12px 40px", display: "flex", justifyContent: "center", alignItems: "flex-start" }} onClick={(event) => event.target === event.currentTarget && onClose()}>
        <div
          style={{
            width,
            maxWidth: "100%",
            background: "#fff",
            color: "#151515",
            borderRadius: desktop ? 10 : 34,
            border: desktop ? "1px solid #d8d8d8" : "10px solid #1b1b1b",
            boxShadow: "0 24px 70px rgba(0,0,0,.4)",
            overflow: "hidden",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase", textAlign: "center" }}>Nure Asmir</div>
          <div style={{ display: "grid", gridTemplateColumns: desktop ? "1.1fr 1fr" : "1fr", gap: desktop ? 32 : 0, padding: desktop ? 28 : 0 }}>
            <div>
              <div style={{ position: "relative", aspectRatio: "3 / 4", background: "#f1f1f1", display: "grid", placeItems: "center", overflow: "hidden", borderRadius: desktop ? 6 : 0 }}>
                {photos[photoIndex] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photos[photoIndex]} alt={`${data.name} – ${color?.name ?? ""}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ color: "#888", padding: 20, textAlign: "center" }}>No photo for {color?.name || "this colour"} yet</span>
                )}
                {data.badge && <span style={{ position: "absolute", left: 10, top: 10, background: "#151515", color: "#fff", fontSize: 11, padding: "4px 8px", letterSpacing: ".1em", textTransform: "uppercase" }}>{data.badge}</span>}
              </div>
              {photos.length > 1 && (
                <div style={{ display: "flex", gap: 6, padding: desktop ? "10px 0 0" : 10, overflowX: "auto" }}>
                  {photos.map((url, index) => (
                    <button key={url + index} type="button" onClick={() => setPhotoIndex(index)} aria-label={`Photo ${index + 1}`} aria-pressed={index === photoIndex} style={{ flex: "none", width: 56, height: 72, padding: 0, border: index === photoIndex ? "2px solid #151515" : "1px solid #ddd", background: "#f1f1f1", cursor: "pointer" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: desktop ? "8px 0" : "16px 18px 24px", display: "grid", gap: 14, alignContent: "start" }}>
              <div>
                <p style={{ margin: 0, color: "#777", fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase" }}>{data.type || "Product type"}</p>
                <h2 style={{ margin: "4px 0 0", fontSize: desktop ? 28 : 22, fontWeight: 500, lineHeight: 1.2 }}>{data.name || "Product name"}</h2>
                {data.shortDescription && <p style={{ margin: "6px 0 0", color: "#555" }}>{data.shortDescription}</p>}
              </div>
              <p style={{ margin: 0, fontSize: 18 }}>
                {shown ? (
                  <>
                    {chosen || sizes.length < 2 ? "" : sizes.some((s) => s.price !== sizes[0].price) ? "From " : ""}
                    <strong>{pkr(Math.min(...(chosen ? [chosen.price] : sizes.map((s) => s.price))))}</strong>
                    {shown.compareAt ? <s style={{ marginLeft: 8, color: "#888" }}>{pkr(shown.compareAt)}</s> : null}
                  </>
                ) : (
                  <span style={{ color: "#888" }}>No price yet</span>
                )}
              </p>
              {data.colors.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: 13, color: "#555" }}>
                    Colour: <strong style={{ color: "#151515" }}>{color?.name || "—"}</strong>
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {data.colors.map((c, index) => (
                      <button key={c.name + index} type="button" onClick={() => pick(index)} aria-pressed={index === colorIndex} style={{ padding: "8px 14px", border: index === colorIndex ? "2px solid #151515" : "1px solid #ccc", background: "#fff", color: "#151515", cursor: "pointer", font: "inherit", fontSize: 14 }}>
                        {c.name || "New colour"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {sizes.some((s) => s.size) && (
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: 13, color: "#555" }}>Size</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {sizes.map((s) => (
                      <button key={s.size} type="button" disabled={s.stock <= 0} onClick={() => setSize(s.size)} aria-pressed={s.size === size} title={s.stock <= 0 ? "Sold out" : s.stock <= 3 ? `Only ${s.stock} left` : undefined} style={{ minWidth: 48, padding: "8px 12px", border: s.size === size ? "2px solid #151515" : "1px solid #ccc", background: s.stock <= 0 ? "#f3f3f3" : "#fff", color: s.stock <= 0 ? "#aaa" : "#151515", textDecoration: s.stock <= 0 ? "line-through" : "none", cursor: s.stock <= 0 ? "not-allowed" : "pointer", font: "inherit", fontSize: 14 }}>
                        {s.size || "—"}
                      </button>
                    ))}
                  </div>
                  {chosen && chosen.stock > 0 && chosen.stock <= 3 && <p style={{ margin: "6px 0 0", fontSize: 13, color: "#a33" }}>Only {chosen.stock} left</p>}
                </div>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                <button type="button" disabled style={{ padding: 14, border: "1px solid #151515", background: "#fff", color: "#151515", font: "inherit", letterSpacing: ".12em", textTransform: "uppercase", fontSize: 12 }}>
                  {allOut ? "Sold out" : "Add to bag"}
                </button>
                <button type="button" disabled style={{ padding: 14, border: 0, background: allOut ? "#999" : "#151515", color: "#fff", font: "inherit", letterSpacing: ".12em", textTransform: "uppercase", fontSize: 12 }}>
                  Buy it now
                </button>
              </div>
              {data.description && <p style={{ margin: 0, color: "#333", lineHeight: 1.6, whiteSpace: "pre-line" }}>{data.description}</p>}
              {(data.material || data.care) && (
                <dl style={{ margin: 0, display: "grid", gap: 6, fontSize: 14, color: "#444" }}>
                  {data.material && (
                    <div>
                      <dt style={{ display: "inline", fontWeight: 600 }}>Fabric: </dt>
                      <dd style={{ display: "inline", margin: 0 }}>{data.material}</dd>
                    </div>
                  )}
                  {data.care && (
                    <div>
                      <dt style={{ display: "inline", fontWeight: 600 }}>Care: </dt>
                      <dd style={{ display: "inline", margin: 0 }}>{data.care}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
