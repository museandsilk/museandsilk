"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CampaignSlide } from "@/lib/commerce";
import { buildSrcSet } from "@/lib/images";

const fallback: CampaignSlide = {
  id: "campaign-default",
  imageUrl: "/campaign-hero.webp",
  mobileImageUrl: null,
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
  const [zoomCycle, setZoomCycle] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const wasVisible = useRef(true);

  useEffect(() => {
    if (items.length < 2) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % items.length), 5000);
    return () => window.clearInterval(timer);
  }, [items.length]);

  // Restart the hero image's slow zoom whenever it re-enters the viewport (e.g. the visitor
  // scrolls down and back up), rather than leaving it mid-zoom or already fully zoomed in.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !wasVisible.current) {
          setZoomCycle((cycle) => cycle + 1);
        }
        wasVisible.current = entry.isIntersecting;
      },
      { threshold: 0.6 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const slide = items[active];
  return (
    <section ref={sectionRef} className="hero campaign-carousel" aria-labelledby="hero-title">
      <div className="campaign-images">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`campaign-slide ${index === active ? "active" : ""}`}
            style={item.blurDataUrl ? { backgroundImage: `url(${item.blurDataUrl})` } : undefined}
          >
            {item.mobileImageUrl ? (
              <picture key={`${item.id}-${index === active ? zoomCycle : "idle"}`}>
                <source media="(max-width: 760px)" srcSet={buildSrcSet(item.mobileImageUrl)} sizes="100vw" />
                <img
                  src={item.imageUrl}
                  srcSet={buildSrcSet(item.imageUrl)}
                  sizes="100vw"
                  alt={index === active ? item.altText : ""}
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
                />
              </picture>
            ) : (
              <img
                key={`${item.id}-${index === active ? zoomCycle : "idle"}`}
                src={item.imageUrl}
                srcSet={buildSrcSet(item.imageUrl)}
                sizes="100vw"
                alt={index === active ? item.altText : ""}
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
              />
            )}
          </div>
        ))}
      </div>
      <div className="hero-shade" />
      <div className="hero-copy">
        <p className="eyebrow">{slide.eyebrow}</p>
        <h1 id="hero-title">{slide.headline}</h1>
        <p className="hero-note">{slide.body}</p>
        <div className="hero-actions">
          <Link href={slide.ctaHref} className="button button-dark">{slide.ctaLabel}</Link>
          <Link href="/collections/scarves" className="text-link light-link">Discover scarves <span aria-hidden="true">↗︎</span></Link>
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
