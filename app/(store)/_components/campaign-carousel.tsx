"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CampaignSlide } from "@/lib/commerce";

const fallback: CampaignSlide = {
  id: "campaign-default",
  imageUrl: "/campaign-hero.webp",
  altText: "Woman wearing an ivory and oxblood printed scarf with dark sunglasses",
  eyebrow: "The first edit · 2026",
  headline: "The final layer, considered.",
  body: "Scarves, bandanas and eyewear selected for the way they transform an everyday look.",
  ctaLabel: "Shop the first edit",
  ctaHref: "/shop",
  sortOrder: 0,
};

export function CampaignCarousel({ slides }: { slides: CampaignSlide[] }) {
  const items = slides.length ? slides : [fallback];
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % items.length), 5000);
    return () => window.clearInterval(timer);
  }, [items.length]);
  const slide = items[active];
  return (
    <section className="hero campaign-carousel" aria-labelledby="hero-title">
      <div className="campaign-images">
        {items.map((item, index) => (
          <Image
            key={item.id}
            src={item.imageUrl}
            alt={index === active ? item.altText : ""}
            fill
            priority={index === 0}
            sizes="100vw"
            className={index === active ? "active" : ""}
          />
        ))}
      </div>
      <div className="hero-shade" />
      <div className="hero-copy">
        <p className="eyebrow">{slide.eyebrow}</p>
        <h1 id="hero-title">{slide.headline}</h1>
        <p className="hero-note">{slide.body}</p>
        <div className="hero-actions">
          <Link href={slide.ctaHref} className="button button-dark">{slide.ctaLabel}</Link>
          <Link href="/collections/scarves" className="text-link light-link">Discover scarves <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
      {items.length > 1 && (
        <div className="campaign-controls" aria-label="Campaign slides">
          {items.map((item, index) => (
            <button
              key={item.id}
              aria-label={`Show slide ${index + 1}`}
              className={index === active ? "active" : ""}
              onClick={() => setActive(index)}
            >
              <i />
            </button>
          ))}
        </div>
      )}
      <div className="hero-index" aria-hidden="true">
        <span>{String(active + 1).padStart(2, "0")}</span>
        <i />
        <span>{String(items.length).padStart(2, "0")}</span>
      </div>
    </section>
  );
}
