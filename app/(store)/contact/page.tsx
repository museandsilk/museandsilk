import type { Metadata } from "next";
import Link from "next/link";
import { StoreHeader } from "../_components/store-components";
import { Reveal } from "../_components/reveal";
import { getPublicSettings } from "@/lib/commerce";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact",
  description: "Reach Muse & Silk for order help, styling questions or aftercare — by WhatsApp, email or Instagram.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const settings = await getPublicSettings();
  const whatsapp = String(settings.whatsappNumber ?? "").replace(/\D/g, "");

  return (
    <main>
      <StoreHeader />
      <section className="contact-page">
        <div>
          <p className="eyebrow">Personal assistance</p>
          <h1>We are here to help.</h1>
          <p>
            Product questions, sizing and styling guidance, order confirmation and aftercare — every message reaches a real person
            at Muse &amp; Silk, not a queue. WhatsApp is the fastest way to reach us, especially for order confirmation once you have
            checked out.
          </p>
        </div>
        <aside>
          <article>
            <span>WhatsApp Business</span>
            {whatsapp ? (
              <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Hello Muse & Silk, I would like some assistance.")}`} target="_blank" rel="noreferrer">
                Start a conversation ↗︎
              </a>
            ) : (
              <p>Add your WhatsApp number in Owner Studio.</p>
            )}
          </article>
          <article>
            <span>Email</span>
            {settings.supportEmail ? <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a> : <p>Add your support email in Owner Studio.</p>}
          </article>
          <article>
            <span>Phone</span>
            {settings.supportPhone ? <a href={`tel:${settings.supportPhone}`}>{settings.supportPhone}</a> : <p>Add your support phone in Owner Studio.</p>}
          </article>
          <article>
            <span>Instagram</span>
            {settings.instagramUrl ? (
              <a href={settings.instagramUrl} target="_blank" rel="noreferrer">
                Visit Instagram ↗︎
              </a>
            ) : (
              <p>Add your Instagram profile in Owner Studio.</p>
            )}
          </article>
          <article>
            <span>Existing order</span>
            <Link href="/track-order">Track an order →︎</Link>
          </article>
        </aside>
      </section>

      <Reveal>
        <footer className="footer">
          <div className="footer-brand">
            <Link href="/" className="wordmark">
              MUSE <i>&amp;</i> SILK
            </Link>
            <p>Modern accessories, composed with intention.</p>
          </div>
          <div className="footer-links">
            <div>
              <h3>Shop</h3>
              <Link href="/collections/scarves">Scarves</Link>
              <Link href="/collections/bandanas">Bandanas</Link>
              <Link href="/collections/glasses">Eyewear</Link>
              <Link href="/shop">New arrivals</Link>
            </div>
            <div>
              <h3>Service</h3>
              <Link href="/track-order">Track your order</Link>
              <Link href="/policies/shipping">Shipping</Link>
              <Link href="/policies/returns">Returns</Link>
              <Link href="/contact">WhatsApp assistance</Link>
            </div>
            <div>
              <h3>About</h3>
              <Link href="/about">Our story</Link>
              <Link href="/journal">Journal</Link>
              <Link href="/contact">Contact</Link>
              <a href="https://instagram.com" rel="noreferrer">
                Instagram
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 Muse &amp; Silk</span>
            <span>Prices in PKR</span>
            <div>
              <Link href="/policies/privacy">Privacy</Link>
              <Link href="/policies/terms">Terms</Link>
            </div>
          </div>
        </footer>
      </Reveal>
    </main>
  );
}
