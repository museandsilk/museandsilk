"use client";

import { useState } from "react";
import { callApi, useToast } from "../../_ui/client";

type Candidate = { id: string; url: string; bytes: number };
type Batch = { days: number; images: Candidate[]; remaining: number; remainingBytes: number };

const MB = 1024 * 1024;
const fmt = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Re-encodes one picture smaller in this browser: at most 800 px wide, WebP at a steady, still-sharp quality. */
async function shrink(url: string): Promise<{ main: Blob; small: Blob; width: number; height: number } | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const bitmap = await createImageBitmap(await response.blob());
  const encode = (target: number) => {
    const width = Math.min(target, bitmap.width);
    const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve({ blob, width, height }) : reject(new Error("encode failed"))), "image/webp", 0.72));
  };
  const [main, small] = await Promise.all([encode(800), encode(400)]);
  bitmap.close();
  return { main: main.blob, small: small.blob, width: main.width, height: main.height };
}

/**
 * "Make old sold-out photos smaller". Photos of products that have been sold out for a long time are kept (for your records and
 * in case you restock) but squeezed to a smaller size, which frees space for new products. Runs here in your browser, a few
 * pictures at a time, and never touches products that are for sale.
 */
export function PhotoShrinker() {
  const toast = useToast();
  const [info, setInfo] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  const [done, setDone] = useState(0);

  async function check() {
    const result = await callApi<Batch>("/api/admin/photos/shrinkable", "GET");
    if (result.ok) setInfo(result.data);
    else toast(result.error, "bad");
  }

  async function run() {
    setBusy(true);
    setSaved(0);
    setDone(0);
    let total = 0;
    let count = 0;
    try {
      for (let round = 0; round < 40; round++) {
        const list = await callApi<Batch>("/api/admin/photos/shrinkable", "GET");
        if (!list.ok) {
          toast(list.error, "bad");
          break;
        }
        if (!list.data.images.length) break;
        let progressed = 0;
        for (const image of list.data.images) {
          const made = await shrink(image.url).catch(() => null);
          if (!made) continue;
          const form = new FormData();
          form.set("file", made.main, "photo-800.webp");
          form.set("width", String(made.width));
          form.set("height", String(made.height));
          form.set("variantWidths", JSON.stringify([400, made.width]));
          form.set("variant_400", made.small, "photo-400.webp");
          form.set(`variant_${made.width}`, made.main, `photo-${made.width}.webp`);
          const response = await fetch(`/api/admin/images/${image.id}/compact`, { method: "POST", body: form });
          const data = (await response.json().catch(() => ({}))) as { saved?: number; skipped?: boolean };
          if (response.ok) {
            progressed += 1;
            count += 1;
            total += data.saved ?? 0;
            setDone(count);
            setSaved(total);
          }
        }
        if (!progressed) break;
      }
      toast(count ? `Done. ${count} picture${count === 1 ? "" : "s"} made smaller, ${fmt(total)} freed.` : "Nothing needed shrinking.", "good");
    } finally {
      setBusy(false);
      await check();
    }
  }

  return (
    <div className="wide a-stack" style={{ gap: 10 }}>
      <p>
        Pictures of products that have been <strong>sold out for a long time</strong> can be made smaller. They stay on your website records and come back if you restock, but they take much less space.
      </p>
      <div className="a-row">
        <button type="button" className="a-btn" onClick={check} disabled={busy}>
          See how many
        </button>
        <button type="button" className="a-btn a-btn-primary" onClick={run} disabled={busy || (info !== null && info.remaining === 0)} aria-busy={busy}>
          {busy ? <span className="busy-label"><span className="spinner spinner-light" aria-hidden="true" /> Working… {done} done</span> : "Make them smaller"}
        </button>
        {info && <span className="a-muted">{info.remaining ? `${info.remaining} picture${info.remaining === 1 ? "" : "s"} (${fmt(info.remainingBytes)}) can be made smaller.` : "Nothing to shrink right now."}</span>}
        {busy && saved > 0 && <span className="a-muted">{fmt(saved)} freed so far</span>}
      </div>
      <p className="a-help">Keep this page open while it works. It does a few pictures at a time and is safe to stop – whatever was finished stays finished.</p>
    </div>
  );
}
