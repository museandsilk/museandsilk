import type { Metadata } from "next";
import Link from "next/link";
import { StoreFooter } from "../_components/store-footer";
import { getPublicSettings } from "@/lib/commerce";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Contact",
  description: "Reach Nure Asmir for order help, sizing questions or exchanges — by WhatsApp, phone, email or social media.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const settings = await getPublicSettings();
  const whatsapp = String(settings.whatsappNumber ?? "").replace(/\D/g, "");

  return (
    <main>
      <section className="contact-page">
        <div>
          <p className="eyebrow">Customer care</p>
          <h1>We are here to help.</h1>
          <p>
            Product questions, sizing guidance, order confirmation and exchanges — every message reaches a real person
            at Nure Asmir, not a queue. WhatsApp is the fastest way to reach us, especially for order confirmation once you have
            checked out.
          </p>
        </div>
        <aside>
          <article>
            <span>WhatsApp Business</span>
            {settings.whatsappChatUrl || whatsapp ? (
              <a href={settings.whatsappChatUrl || `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hello Nure Asmir, I would like some assistance.")}`} target="_blank" rel="noreferrer">
                Start a conversation ↗︎
              </a>
            ) : (
              <p>Coming soon.</p>
            )}
          </article>
          <article>
            <span>Email</span>
            {settings.supportEmail ? <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a> : <p>Coming soon.</p>}
          </article>
          <article>
            <span>Phone</span>
            {settings.supportPhone ? <a href={`tel:${settings.supportPhone.replace(/\s/g, "")}`}>{settings.supportPhone}</a> : <p>Coming soon.</p>}
          </article>
          <article>
            <span>Instagram</span>
            {settings.instagramUrl ? (
              <a href={settings.instagramUrl} target="_blank" rel="noreferrer">
                Visit Instagram ↗︎
              </a>
            ) : (
              <p>Coming soon.</p>
            )}
          </article>
          <article>
            <span>Facebook</span>
            {settings.facebookUrl ? (
              <a href={settings.facebookUrl} target="_blank" rel="noreferrer">
                Visit Facebook ↗︎
              </a>
            ) : (
              <p>Coming soon.</p>
            )}
          </article>
          <article>
            <span>TikTok</span>
            {settings.tiktokUrl ? (
              <a href={settings.tiktokUrl} target="_blank" rel="noreferrer">
                Visit TikTok ↗︎
              </a>
            ) : (
              <p>Coming soon.</p>
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
