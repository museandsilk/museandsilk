"use client";

import Image from "next/image";
import { useState } from "react";
import type { CatalogImage } from "@/lib/commerce";

export function ProductGallery({ name, images, fallback }: { name: string; images: CatalogImage[]; fallback: string }) {
  const gallery = images.length ? images : [{ id: "fallback", url: fallback, altText: name, sortOrder: 0, isPrimary: true }];
  const [active, setActive] = useState(0);

  const current = gallery[Math.min(active, gallery.length - 1)];
  return (
    <div className="product-gallery">
      {gallery.length > 1 && (
        <div className="product-thumbnails">
          {gallery.map((image, index) => (
            <button key={image.id} type="button" className={index === active ? "active" : ""} onClick={() => setActive(index)} aria-label={`View image ${index + 1}`}>
              <Image src={image.url} alt="" fill sizes="76px" />
            </button>
          ))}
        </div>
      )}
      <div className="product-stage">
        <Image
          key={current.id}
          src={current.url}
          alt={current.altText}
          fill
          priority
          sizes="(max-width: 900px) 100vw, 52vw"
          {...(current.blurDataUrl ? { placeholder: "blur" as const, blurDataURL: current.blurDataUrl } : {})}
        />
        {gallery.length > 1 && (
          <span>
            {String(active + 1).padStart(2, "0")} / {String(gallery.length).padStart(2, "0")}
          </span>
        )}
      </div>
    </div>
  );
}
