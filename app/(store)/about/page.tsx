import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { StoreHeader } from "../_components/store-components";
import { StoreFooter } from "../_components/store-footer";

export const metadata: Metadata = {
  title: "Our story",
  description: "Muse & Silk is a modern accessories house built around considered scarves, bandanas and eyewear designed to be worn, not stored.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main>
      <StoreHeader theme="dark" />
      <section className="story-page">
        <div className="story-image">
          <Image src="/campaign-hero.webp" alt="Muse & Silk campaign portrait" fill priority sizes="50vw" />
        </div>
        <article>
          <p className="eyebrow">Our point of view</p>
          <h1>Accessories are the final idea.</h1>

          <p>
            Muse and Silk began with a narrow, stubborn question: why should the piece that finishes a look be the one we think about
            least? Scarves were folded away in drawers. Sunglasses were an afterthought bought at an airport counter. We started this
            house to treat the final layer with the same seriousness as everything underneath it.
          </p>

          <p>
            We work in three categories only — scarves, bandanas and eyewear — because restraint is part of the design brief, not a
            limitation of it. Each edit is small enough that every piece earns its place. Nothing is added to fill a rack, and nothing
            ships until the color, the drape, the stitch and the finish meet the standard we set for it.
          </p>

          <blockquote>Less noise. More intention.</blockquote>

          <p>
            Our approach to materials is direct. We favor silk-touch fabrications that hold color without becoming precious, weights
            that move rather than stiffen, and finishes that soften with wear instead of fraying with it. A scarf from this house is
            built to be knotted, wrapped and re-worn through a hundred different outfits, not preserved behind tissue paper.
          </p>

          <p>
            The same discipline shapes our eyewear. Frames are chosen for how they sit on a real face across a full day — light at the
            temple, balanced at the bridge — before we consider how they photograph. Confidence, to us, is a frame you forget you are
            wearing until someone asks where it is from.
          </p>

          <p>
            What we are building is not a wardrobe of disposable extras. It is a short list of objects designed to be reached for
            repeatedly — the scarf that rescues a plain coat, the bandana that changes a bag entirely, the sunglasses that make a
            Tuesday feel considered. Every product page on this site is written from verified supplier information, every sellable
            option carries its own SKU and stock count, and every order is personally reviewed before it leaves us.
          </p>

          <p>
            We deliver across Pakistan, we confirm every order by phone or WhatsApp before it is dispatched, and we stand behind what
            we sell. If a piece is not right, our{" "}
            <Link href="/policies/returns">returns policy</Link> explains exactly how to send it back. If you have a question before
            you buy, <Link href="/contact">write to us</Link> — a person, not a script, will answer.
          </p>
        </article>
      </section>

      <StoreFooter />
    </main>
  );
}
