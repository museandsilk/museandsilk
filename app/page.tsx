import Image from "next/image";
import Link from "next/link";
import { StoreHeader, ProductCard, NewsletterForm } from "./(store)/_components/store-components";
import { StoreFooter } from "./(store)/_components/store-footer";
import { getActiveCategories, getCampaignSlides, getCatalogProducts, getPublicSettings } from "@/lib/commerce";
import { CampaignCarousel } from "./(store)/_components/campaign-carousel";
import { Reveal } from "./(store)/_components/reveal";

export const revalidate = 300;

// Used only when a category has no admin-set description — keyed by slug and, as a fallback for
// older data, lowercase name, so the three founding categories keep their original copy even
// though the homepage card order now comes from sortOrder instead of a fixed array.
const CATEGORY_NOTES: Record<string, string> = {
  scarves: "Fluid statements in silk and fine blends.",
  bandanas: "A smaller gesture with a distinct point of view.",
  glasses: "Confident frames, softened by considered detail.",
  eyewear: "Confident frames, softened by considered detail.",
};

export default async function Home() {
  const [products, campaignSlides, settings, categories] = await Promise.all([
    getCatalogProducts(),
    getCampaignSlides(),
    getPublicSettings(),
    getActiveCategories(),
  ]);
  // Admin-picked "Featured on homepage" products lead the spotlight (newest-featured first, since
  // `products` already comes back sorted by publishedAt/createdAt desc); if fewer than 4 are
  // marked featured, the newest non-featured products fill the remaining slots so the section is
  // never sparse.
  const spotlightProducts = [...products.filter((product) => product.featured), ...products.filter((product) => !product.featured)].slice(0, 4);
  return (
    <main className="page-fade-in">
      <StoreHeader theme="dark" />
      <CampaignCarousel slides={campaignSlides} />

      <section className="service-strip" aria-label="Store benefits">
        <p>Nationwide delivery</p><p>Cash on delivery</p><p>{settings.codReservationHours}-hour order reservation</p><p>WhatsApp assistance</p>
      </section>

      <Reveal>
        <section className="section category-section" aria-labelledby="category-title">
          <div className="section-heading">
            <div><p className="eyebrow">Three signatures</p><h2 id="category-title">Objects of everyday elegance</h2></div>
            <p>A tightly considered collection designed around tactile materials, sculptural form and expressive ease.</p>
          </div>
          <div className="category-grid">
            {[...categories]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .slice(0, 3)
              .map((category, index) => {
                const note = CATEGORY_NOTES[category.slug] ?? CATEGORY_NOTES[category.name.trim().toLowerCase()] ?? category.description ?? "";
                const crop = ["left", "center", "right"][index] ?? "center";
                return (
                  <Link href={`/collections/${category.slug}`} className={`category-card crop-${crop}`} key={category.id}>
                    <Image
                      src={category.imageUrl ?? "/category-still-life.webp"}
                      alt=""
                      fill
                      sizes="(max-width: 760px) 100vw, 33vw"
                      {...(category.blurDataUrl ? { placeholder: "blur" as const, blurDataURL: category.blurDataUrl } : {})}
                    />
                    <span className="category-number">0{index + 1}</span>
                    <div className="category-label"><h3>{category.name}</h3><p>{note}</p><span className="round-arrow" aria-hidden="true">↗︎</span></div>
                  </Link>
                );
              })}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section products-section" aria-labelledby="new-title">
          <div className="section-heading product-heading">
            <div><p className="eyebrow">Freshly arrived</p><h2 id="new-title">The Muse edit</h2></div>
            <Link href="/shop" className="text-link">View all pieces <span aria-hidden="true">→︎</span></Link>
          </div>
          <div className="product-grid">{spotlightProducts.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
        </section>
      </Reveal>

      <Reveal>
        <section className="editorial">
          <div className="editorial-image"><Image src="/campaign-hero.webp" alt="Detail of a flowing printed scarf" fill sizes="(max-width: 760px) 100vw, 55vw" /></div>
          <div className="editorial-copy">
            <p className="eyebrow">The art of the finish</p>
            <h2>One piece can change the whole sentence.</h2>
            <p>We believe accessories are not an afterthought. They are the final idea—the color, line and texture that makes a look feel entirely your own.</p>
            <Link href="/about" className="text-link">Enter our world <span aria-hidden="true">↗︎</span></Link>
            <span className="editorial-mark" aria-hidden="true">M &amp; S</span>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section journal" aria-labelledby="journal-title">
          <div className="section-heading">
            <div><p className="eyebrow">Notes from the studio</p><h2 id="journal-title">Ways of wearing</h2></div>
            <p>Practical styling, material care and quiet inspiration for pieces meant to live beyond a season.</p>
          </div>
          <div className="journal-grid">
            <article className="journal-lead">
              <div className="journal-image journal-image-left"><Image src="/category-still-life.webp" alt="" fill sizes="66vw" /></div>
              <p className="eyebrow">Styling · 6 min</p><h3>Seven quiet ways to wear a silk scarf</h3>
              <Link href="/journal/seven-ways-to-wear-a-scarf" className="text-link">Read the story <span aria-hidden="true">→︎</span></Link>
            </article>
            <article className="journal-side">
              <div className="journal-image journal-image-right"><Image src="/category-still-life.webp" alt="" fill sizes="33vw" /></div>
              <p className="eyebrow">Care · 4 min</p><h3>Keeping silk soft, luminous and beautifully folded</h3>
              <Link href="/journal/silk-care" className="text-link">Read the story <span aria-hidden="true">→︎</span></Link>
            </article>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="newsletter">
          <p className="eyebrow">Private notes</p><h2>New edits, styling notes and first access.</h2>
          <p>No noise. Only the pieces and stories worth sharing.</p><NewsletterForm />
        </section>
      </Reveal>

      <StoreFooter />
    </main>
  );
}
