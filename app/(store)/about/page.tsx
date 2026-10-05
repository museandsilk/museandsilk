import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { StoreFooter } from "../_components/store-footer";

export const metadata: Metadata = {
  title: "Our story",
  description: "Nure Asmir is a Pakistani men's wear label — tradition in a modern form. Shalwar kameez, shirts, pants and accessories.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main>
      <section className="story-page">
        <div className="story-image">
          <Image src="/og.jpg" alt="Nure Asmir men's wear storefront" fill priority sizes="50vw" />
        </div>
        <article>
          <p className="eyebrow">Our story</p>
          <h1>Tradition in a modern form.</h1>

          <p>
            Nure Asmir is a men&apos;s wear label from Pakistan. We design the pieces a man reaches for every day — shalwar kameez, shirts,
            pants and leather accessories — with one idea in mind: keep what is timeless about how we dress, and cut it for how we live now.
          </p>

          <p>
            Our range is deliberately small. Each piece is designed to be worn often and to pair easily with the rest of your wardrobe, so
            nothing is added just to fill a rail.
          </p>

          <blockquote>Style. Heritage. Confidence.</blockquote>

          <p>
            We deliver across Pakistan, with cash on delivery available, and we confirm every order by phone or WhatsApp before it is
            dispatched. If a piece is not right, our <Link href="/policies/returns">returns policy</Link> explains how to exchange it. If you
            have a question before you buy, <Link href="/contact">write to us</Link> — a person will answer.
          </p>
        </article>
      </section>

      <StoreFooter />
    </main>
  );
}
