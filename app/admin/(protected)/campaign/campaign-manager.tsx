"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { processImageClientSide } from "@/lib/client-image-processing";

type Slide = {
  id: string;
  imageUrl: string;
  altText: string;
  eyebrow: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  sortOrder: number;
  active: boolean;
};

export function CampaignManager() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/campaign", { cache: "no-store" });
    if (response.ok) setSlides((await response.json()).slides);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("Processing image…");
    const form = new FormData(event.currentTarget);

    const file = form.get("file");
    if (file instanceof File) {
      const processed = await processImageClientSide(file);
      if (processed) {
        form.set("blurDataUrl", processed.blurDataUrl);
        form.set("variantWidths", JSON.stringify(processed.variants.map((v) => v.width)));
        for (const variant of processed.variants) {
          form.set(`variant_${variant.width}`, variant.blob, `variant-${variant.width}.webp`);
        }
      }
    }

    setMessage("Uploading…");
    const response = await fetch("/api/admin/campaign", { method: "POST", body: form });
    const result = await response.json();
    setMessage(response.ok ? "Campaign slide added." : result.error ?? "Slide could not be added.");
    if (response.ok) {
      event.currentTarget.reset();
      await refresh();
    }
    setBusy(false);
  }

  async function saveSlide(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      eyebrow: form.get("eyebrow"),
      headline: form.get("headline"),
      body: form.get("body"),
      ctaLabel: form.get("ctaLabel"),
      ctaHref: form.get("ctaHref"),
      sortOrder: form.get("sortOrder"),
      active: form.get("active") === "on",
    };
    const response = await fetch(`/api/admin/campaign/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(response.ok ? "Slide updated." : "Slide could not be updated.");
    if (response.ok) await refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this campaign slide?")) return;
    const response = await fetch(`/api/admin/campaign/${id}`, { method: "DELETE" });
    setMessage(response.ok ? "Campaign slide removed." : "Slide could not be removed.");
    if (response.ok) await refresh();
  }

  return (
    <section className="admin-main">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Muse &amp; Silk</p>
          <h1>Campaign</h1>
        </div>
      </header>
      {message && (
        <div className="admin-message" role="status">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}
      <div className="campaign-admin-grid">
        <section className="campaign-list">
          <p className="eyebrow">Current sequence</p>
          {slides.length ? (
            slides.map((slide, index) => (
              <article key={slide.id}>
                <div>
                  <Image src={slide.imageUrl} alt={slide.altText} fill unoptimized sizes="220px" />
                </div>
                <span>0{index + 1}</span>
                <section>
                  <form onSubmit={(event) => saveSlide(event, slide.id)} className="admin-form-grid">
                    <label>
                      <span>Small heading</span>
                      <input name="eyebrow" defaultValue={slide.eyebrow} />
                    </label>
                    <label>
                      <span>Main headline</span>
                      <input name="headline" defaultValue={slide.headline} />
                    </label>
                    <label className="field-wide">
                      <span>Supporting text</span>
                      <textarea name="body" rows={2} defaultValue={slide.body} />
                    </label>
                    <label>
                      <span>Button label</span>
                      <input name="ctaLabel" defaultValue={slide.ctaLabel} />
                    </label>
                    <label>
                      <span>Button link</span>
                      <input name="ctaHref" defaultValue={slide.ctaHref} />
                    </label>
                    <label>
                      <span>Sequence</span>
                      <input type="number" min="0" name="sortOrder" defaultValue={slide.sortOrder} />
                    </label>
                    <label className="admin-check">
                      <input type="checkbox" name="active" defaultChecked={slide.active} />
                      <span>Active</span>
                    </label>
                    <button className="admin-primary">Save slide</button>
                  </form>
                  <button onClick={() => remove(slide.id)}>Remove slide</button>
                </section>
              </article>
            ))
          ) : (
            <div className="admin-empty">
              <h3>The original campaign is active.</h3>
              <p>Add an image to begin the rotating sequence.</p>
            </div>
          )}
        </section>
        <form className="campaign-upload" onSubmit={upload}>
          <p className="eyebrow">New slide</p>
          <h2>Add campaign image</h2>
          <label>
            <span>Image</span>
            <input required type="file" name="file" accept="image/jpeg,image/png,image/webp" />
          </label>
          <label>
            <span>Accessible image description</span>
            <input required name="altText" />
          </label>
          <label>
            <span>Small heading</span>
            <input name="eyebrow" defaultValue="The first edit · 2026" />
          </label>
          <label>
            <span>Main headline</span>
            <input name="headline" defaultValue="The final layer, considered." />
          </label>
          <label>
            <span>Supporting text</span>
            <textarea name="body" rows={3} defaultValue="Scarves, bandanas and eyewear selected for the way they transform an everyday look." />
          </label>
          <div>
            <label>
              <span>Button label</span>
              <input name="ctaLabel" defaultValue="Shop the first edit" />
            </label>
            <label>
              <span>Button link</span>
              <input name="ctaHref" defaultValue="/shop" />
            </label>
          </div>
          <label>
            <span>Sequence number</span>
            <input type="number" min="0" name="sortOrder" defaultValue={slides.length} />
          </label>
          <button className="admin-primary" disabled={busy}>
            {busy ? (
              <span className="busy-label">
                <span className="spinner spinner-light" aria-hidden="true" /> {message || "Uploading…"}
              </span>
            ) : (
              "Add to homepage rotation"
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
