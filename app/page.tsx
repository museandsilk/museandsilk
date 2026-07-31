import Image from "next/image";
import Link from "next/link";
import { StoreHeader, ProductCard, NewsletterForm } from "./(store)/_components/store-components";
import { getCampaignSlides, getCatalogProducts } from "@/lib/commerce";
import { CampaignCarousel } from "./(store)/_components/campaign-carousel";

export const revalidate = 300;

export default async function Home() {
  const [products, campaignSlides] = await Promise.all([getCatalogProducts(), getCampaignSlides()]);
  return (
    <main className="page-fade-in">
      <StoreHeader />
      <CampaignCarousel slides={campaignSlides} />

      <section className="service-strip" aria-label="Store benefits">
        <p>Nationwide delivery</p><p>Cash on delivery</p><p>12-hour order reservation</p><p>WhatsApp assistance</p>
      </section>

      <section className="section category-section" aria-labelledby="category-title">
        <div className="section-heading">
          <div><p className="eyebrow">Three signatures</p><h2 id="category-title">Objects of everyday elegance</h2></div>
          <p>A tightly considered collection designed around tactile materials, sculptural form and expressive ease.</p>
        </div>
        <div className="category-grid">
          {[
            ["Scarves", "Fluid statements in silk and fine blends.", "left"],
            ["Bandanas", "A smaller gesture with a distinct point of view.", "center"],
            ["Eyewear", "Confident frames, softened by considered detail.", "right"],
          ].map(([name, note, crop], index) => (
            <Link href={`/collections/${name.toLowerCase()}`} className={`category-card crop-${crop}`} key={name}>
              <Image src="/category-still-life.webp" alt="" fill sizes="(max-width: 760px) 100vw, 33vw" />
              <span className="category-number">0{index + 1}</span>
              <div className="category-label"><h3>{name}</h3><p>{note}</p><span className="round-arrow" aria-hidden="true">↗</span></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section products-section" aria-labelledby="new-title">
        <div className="section-heading product-heading">
          <div><p className="eyebrow">Freshly arrived</p><h2 id="new-title">The Muse edit</h2></div>
          <Link href="/shop" className="text-link">View all pieces <span aria-hidden="true">→</span></Link>
        </div>
        <div className="product-grid">{products.slice(0, 4).map((product) => <ProductCard key={product.slug} product={product} />)}</div>
      </section>

      <section className="editorial">
        <div className="editorial-image"><Image src="/campaign-hero.webp" alt="Detail of a flowing printed scarf" fill sizes="(max-width: 760px) 100vw, 55vw" /></div>
        <div className="editorial-copy">
          <p className="eyebrow">The art of the finish</p>
          <h2>One piece can change the whole sentence.</h2>
          <p>We believe accessories are not an afterthought. They are the final idea—the color, line and texture that makes a look feel entirely your own.</p>
          <Link href="/about" className="text-link">Enter our world <span aria-hidden="true">↗</span></Link>
          <span className="editorial-mark" aria-hidden="true">M &amp; S</span>
        </div>
      </section>

      <section className="section journal" aria-labelledby="journal-title">
        <div className="section-heading">
          <div><p className="eyebrow">Notes from the studio</p><h2 id="journal-title">Ways of wearing</h2></div>
          <p>Practical styling, material care and quiet inspiration for pieces meant to live beyond a season.</p>
        </div>
        <div className="journal-grid">
          <article className="journal-lead">
            <div className="journal-image journal-image-left"><Image src="/category-still-life.webp" alt="" fill sizes="66vw" /></div>
            <p className="eyebrow">Styling · 6 min</p><h3>Seven quiet ways to wear a silk scarf</h3>
            <Link href="/journal/seven-ways-to-wear-a-scarf" className="text-link">Read the story <span aria-hidden="true">→</span></Link>
          </article>
          <article className="journal-side">
            <div className="journal-image journal-image-right"><Image src="/category-still-life.webp" alt="" fill sizes="33vw" /></div>
            <p className="eyebrow">Care · 4 min</p><h3>Keeping silk soft, luminous and beautifully folded</h3>
            <Link href="/journal/silk-care" className="text-link">Read the story <span aria-hidden="true">→</span></Link>
          </article>
        </div>
      </section>

      <section className="newsletter">
        <p className="eyebrow">Private notes</p><h2>New edits, styling notes and first access.</h2>
        <p>No noise. Only the pieces and stories worth sharing.</p><NewsletterForm />
      </section>

      <footer className="footer">
        <div className="footer-brand"><Link href="/" className="wordmark">MUSE <i>&amp;</i> SILK</Link><p>Modern accessories, composed with intention.</p></div>
        <div className="footer-links">
          <div><h3>Shop</h3><Link href="/collections/scarves">Scarves</Link><Link href="/collections/bandanas">Bandanas</Link><Link href="/collections/glasses">Eyewear</Link><Link href="/shop">New arrivals</Link></div>
          <div><h3>Service</h3><Link href="/track-order">Track your order</Link><Link href="/policies/shipping">Shipping</Link><Link href="/policies/returns">Returns</Link><Link href="/contact">WhatsApp assistance</Link></div>
          <div><h3>About</h3><Link href="/about">Our story</Link><Link href="/journal">Journal</Link><Link href="/contact">Contact</Link><a href="https://instagram.com" rel="noreferrer">Instagram</a></div>
        </div>
        <div className="footer-bottom"><span>© 2026 Muse &amp; Silk</span><span>Prices in PKR</span><div><Link href="/policies/privacy">Privacy</Link><Link href="/policies/terms">Terms</Link></div></div>
      </footer>
    </main>
  );
}
