"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { cropImageClientSide, processImageClientSide } from "@/lib/client-image-processing";
import { ImageCropper } from "./image-cropper";

const DESKTOP_ASPECT = 16 / 9;
const MOBILE_ASPECT = 9 / 16;

type PixelCrop = { x: number; y: number; width: number; height: number };

type ImageSlot = {
  file: File | null;
  crop: PixelCrop | null;
  previewUrl: string | null;
};

const EMPTY_SLOT: ImageSlot = { file: null, crop: null, previewUrl: null };

async function makePreview(file: File, crop: PixelCrop): Promise<string> {
  const bitmap = await cropImageClientSide(file, crop);
  const previewWidth = 320;
  const previewHeight = Math.max(1, Math.round((bitmap.height / bitmap.width) * previewWidth));
  const canvas = document.createElement("canvas");
  canvas.width = previewWidth;
  canvas.height = previewHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, previewWidth, previewHeight);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.7);
}

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
  const [desktopSlot, setDesktopSlot] = useState<ImageSlot>(EMPTY_SLOT);
  const [mobileSlot, setMobileSlot] = useState<ImageSlot>(EMPTY_SLOT);
  const [cropTarget, setCropTarget] = useState<"desktop" | "mobile" | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/campaign", { cache: "no-store" });
    if (response.ok) setSlides((await response.json()).slides);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function pickFile(target: "desktop" | "mobile", file: File | null) {
    if (!file) return;
    (target === "desktop" ? setDesktopSlot : setMobileSlot)({ file, crop: null, previewUrl: null });
    setCropTarget(target);
  }

  async function confirmCrop(crop: PixelCrop) {
    const target = cropTarget;
    setCropTarget(null);
    if (!target) return;
    const setSlot = target === "desktop" ? setDesktopSlot : setMobileSlot;
    setSlot((slot) => (slot.file ? { ...slot, crop } : slot));
    const file = target === "desktop" ? desktopSlot.file : mobileSlot.file;
    if (!file) return;
    try {
      const previewUrl = await makePreview(file, crop);
      setSlot((slot) => ({ ...slot, previewUrl }));
    } catch {
      // Preview is a nicety only — the stored crop rect is what actually matters at upload time.
    }
  }

  async function processSlot(slot: ImageSlot, prefix: string, form: FormData) {
    if (!slot.file || !slot.crop) return;
    const bitmap = await cropImageClientSide(slot.file, slot.crop);
    const processed = await processImageClientSide(bitmap);
    if (!processed) return;
    const largest = processed.variants[processed.variants.length - 1];
    form.set(prefix ? `${prefix}File` : "file", largest.blob, `campaign-${prefix || "desktop"}.webp`);
    form.set(`${prefix}blurDataUrl`, processed.blurDataUrl);
    form.set(`${prefix}variantWidths`, JSON.stringify(processed.variants.map((v) => v.width)));
    for (const variant of processed.variants) {
      form.set(`${prefix}variant_${variant.width}`, variant.blob, `${prefix}variant-${variant.width}.webp`);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!desktopSlot.file || !desktopSlot.crop) {
      setMessage("Choose and crop a desktop image first.");
      return;
    }
    setBusy(true);
    setMessage("Processing image…");
    const form = new FormData(event.currentTarget);

    await processSlot(desktopSlot, "", form);
    if (mobileSlot.file && mobileSlot.crop) await processSlot(mobileSlot, "mobile", form);

    setMessage("Uploading…");
    const response = await fetch("/api/admin/campaign", { method: "POST", body: form });
    const result = await response.json();
    setMessage(response.ok ? "Campaign slide added." : result.error ?? "Slide could not be added.");
    if (response.ok) {
      event.currentTarget.reset();
      setDesktopSlot(EMPTY_SLOT);
      setMobileSlot(EMPTY_SLOT);
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
                  <Image src={slide.imageUrl} alt={slide.altText} fill sizes="220px" />
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
          <div className="campaign-image-slots">
            <div className="campaign-image-slot">
              <span>Desktop image (16:9, required)</span>
              {desktopSlot.previewUrl ? (
                <div className="campaign-slot-preview">
                  <Image src={desktopSlot.previewUrl} alt="" fill unoptimized sizes="220px" />
                </div>
              ) : (
                <div className="campaign-slot-empty">No crop set yet</div>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => pickFile("desktop", event.target.files?.[0] ?? null)}
              />
              {desktopSlot.file && !desktopSlot.crop && (
                <small>Choose &ldquo;Use this crop&rdquo; in the popup to confirm framing.</small>
              )}
            </div>
            <div className="campaign-image-slot">
              <span>Mobile image (9:16, optional — falls back to the desktop crop if skipped)</span>
              {mobileSlot.previewUrl ? (
                <div className="campaign-slot-preview campaign-slot-preview-tall">
                  <Image src={mobileSlot.previewUrl} alt="" fill unoptimized sizes="140px" />
                </div>
              ) : (
                <div className="campaign-slot-empty campaign-slot-empty-tall">No crop set yet</div>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => pickFile("mobile", event.target.files?.[0] ?? null)}
              />
            </div>
          </div>
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
      {cropTarget && (cropTarget === "desktop" ? desktopSlot.file : mobileSlot.file) && (
        <ImageCropper
          file={(cropTarget === "desktop" ? desktopSlot.file : mobileSlot.file) as File}
          aspect={cropTarget === "desktop" ? DESKTOP_ASPECT : MOBILE_ASPECT}
          label={cropTarget === "desktop" ? "Crop desktop image (16:9)" : "Crop mobile image (9:16)"}
          onConfirm={confirmCrop}
          onCancel={() => setCropTarget(null)}
        />
      )}
    </section>
  );
}
