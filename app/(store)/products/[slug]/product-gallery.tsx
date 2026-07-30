"use client";

import Image from "next/image";
import { useState } from "react";
import type { CatalogImage } from "@/lib/commerce";

export function ProductGallery({
  name,
  crop,
  images,
  fallback,
}: {
  name: string;
  crop: string;
  images: CatalogImage[];
  fallback: string;
}) {
  const gallery = images.length ? images : [{ id: "fallback", url: fallback, altText: name, sortOrder: 0, isPrimary: true }];
  const [active, setActive] = useState(0);
  return (
    <div className={`product-gallery crop-${crop}`}>
      <Image
        src={gallery[active].url}
        alt={gallery[active].altText}
        fill
        priority
        sizes="(max-width: 800px) 100vw, 58vw"
        {...(gallery[active].blurDataUrl ? { placeholder: "blur" as const, blurDataURL: gallery[active].blurDataUrl } : {})}
      />
      <span>
        {String(active + 1).padStart(2, "0")} / {String(gallery.length).padStart(2, "0")}
      </span>
      {gallery.length > 1 && (
        <div className="product-thumbnails">
          {gallery.map((image, index) => (
            <button key={image.id} className={index === active ? "active" : ""} onClick={() => setActive(index)} aria-label={`View image ${index + 1}`}>
              <Image src={image.url} alt="" fill sizes="60px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
