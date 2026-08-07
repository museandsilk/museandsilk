import Link from "next/link";
import { getPublicSettings } from "@/lib/commerce";

export async function StoreFooter() {
  const settings = await getPublicSettings();
  const instagramUrl = settings.instagramUrl || "https://www.instagram.com/museandsilk/";

  return (
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
          <Link href="/faq">FAQ</Link>
          <Link href="/policies/shipping">Shipping</Link>
          <Link href="/policies/returns">Returns</Link>
          <Link href="/contact">WhatsApp assistance</Link>
        </div>
        <div>
          <h3>About</h3>
          <Link href="/about">Our story</Link>
          <Link href="/journal">Journal</Link>
          <Link href="/contact">Contact</Link>
          <a href={instagramUrl} rel="noreferrer">
            Instagram
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Muse &amp; Silk</span>
        <span>Prices in PKR</span>
        <div>
          <Link href="/policies/privacy">Privacy</Link>
          <Link href="/policies/terms">Terms</Link>
        </div>
      </div>
    </footer>
  );
}
