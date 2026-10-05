import Image from "next/image";
import Link from "next/link";
import { getActiveCategories, getPublicSettings } from "@/lib/commerce";
import { BRAND } from "@/lib/brand";
import { NewsletterForm } from "./store-components";
import { InstagramIcon, WhatsAppIcon } from "./icons";

export async function StoreFooter() {
  const [settings, categories] = await Promise.all([getPublicSettings(), getActiveCategories()]);
  const whatsapp = settings.whatsappNumber ? `https://wa.me/${settings.whatsappNumber.replace(/[^\d]/g, "")}` : "/contact";

  return (
    <>
      <section className="newsletter" aria-labelledby="newsletter-title">
        <h2 id="newsletter-title">Subscribe to our newsletter</h2>
        <p>Sign up for new arrivals, offers and more.</p>
        <NewsletterForm />
      </section>
      <footer className="footer">
        <div className="footer-main">
          <div className="footer-brand">
            <Image src="/brand/wordmark-light.png" alt={BRAND.name} width={395} height={100} unoptimized />
            <p>{BRAND.description}</p>
            <div className="footer-social">
              {settings.instagramUrl && (
                <a href={settings.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram">
                  <InstagramIcon />
                </a>
              )}
              <a href={whatsapp} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                <WhatsAppIcon size={18} />
              </a>
            </div>
          </div>
          <div className="footer-links">
            <div>
              <h3>Shop</h3>
              <Link href="/shop">New arrivals</Link>
              {categories.map((category) => (
                <Link key={category.slug} href={`/collections/${category.slug}`}>
                  {category.name}
                </Link>
              ))}
            </div>
            <div>
              <h3>Customer care</h3>
              <Link href="/track-order">Track your order</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/policies/shipping">Shipping</Link>
              <Link href="/policies/returns">Returns &amp; exchanges</Link>
              <Link href="/contact">Contact us</Link>
            </div>
            <div>
              <h3>Company</h3>
              <Link href="/about">Our story</Link>
              <Link href="/policies/privacy">Privacy policy</Link>
              <Link href="/policies/terms">Terms of service</Link>
              {settings.supportPhone && <p>{settings.supportPhone}</p>}
              {settings.supportEmail && <p>{settings.supportEmail}</p>}
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </span>
          <span>Prices in PKR · Cash on delivery nationwide</span>
        </div>
      </footer>
    </>
  );
}
