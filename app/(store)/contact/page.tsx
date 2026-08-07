import type { Metadata } from "next";
import Link from "next/link";
import { StoreHeader } from "../_components/store-components";
import { StoreFooter } from "../_components/store-footer";
import { getPublicSettings } from "@/lib/commerce";

export const revalidate = 300;

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

      <StoreFooter />
    </main>
  );
}
