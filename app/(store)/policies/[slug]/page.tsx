import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StoreHeader } from "../../_components/store-components";

type Policy = {
  title: string;
  intro: string;
  sections: [string, string][];
};

const policies: Record<string, Policy> = {
  shipping: {
    title: "Shipping & delivery",
    intro: "Clear delivery expectations for every Muse & Silk order, delivered nationwide across Pakistan.",
    sections: [
      [
        "Order confirmation",
        "Cash-on-delivery orders reserve your stock for 12 hours while we confirm the order by phone or WhatsApp. Bank-deposit orders reserve stock for 24 hours while your payment is verified. If confirmation or payment is not completed within that window, the reservation may expire and the stock is released.",
      ],
      [
        "Delivery charges",
        "Delivery is charged according to the delivery zone your city or province falls into — not by parcel weight. The exact charge for your zone is shown at checkout before you place your order. Delivery is complimentary on orders that reach the current free-delivery threshold of PKR 12,000.",
      ],
      [
        "Delivery timing",
        "Estimated delivery timing is shown for your selected zone at checkout. Most deliveries within Pakistan are expected within a few working days of order confirmation; remote areas may require additional time. We will let you know if a delay is expected.",
      ],
      [
        "Payment methods",
        "We currently accept Cash on Delivery and Bank Deposit only. Online card payment is not yet available. Choose the method that suits you at checkout — both are confirmed using the reservation windows described above.",
      ],
      [
        "Receiving your order",
        "Please inspect your parcel promptly on delivery and contact us within 48 hours if it arrives damaged, incomplete or materially different from what you ordered, so we can put it right.",
      ],
    ],
  },
  returns: {
    title: "Returns & exchanges",
    intro: "A straightforward, fair process for pieces that are not quite right.",
    sections: [
      [
        "Return window",
        "You may request a return or exchange within 7 days of delivery. To be eligible, the item must be unworn, unwashed and unused, with all original packaging, tags and protective materials intact.",
      ],
      [
        "How to start a return",
        "Contact us on WhatsApp or by email within the 7-day window with your order number and the reason for return. We will confirm eligibility and share the return address and next steps directly.",
      ],
      [
        "Non-returnable items",
        "Items showing wear, marks, scent, alteration or missing packaging cannot be accepted. Final-sale items and any personalised items are not returnable unless they arrive defective.",
      ],
      [
        "Eyewear returns",
        "Eyewear must be returned without scratches, adjustment or signs of wear, with any hygiene seal or protective film still intact, for the same reasons a worn or altered garment cannot be resold.",
      ],
      [
        "Refunds and exchanges",
        "Approved returns are refunded or exchanged after the item is inspected. Original delivery charges are not refundable. Return delivery is the customer's responsibility unless the item received was incorrect, damaged or defective, in which case we cover it.",
      ],
    ],
  },
  privacy: {
    title: "Privacy",
    intro: "How we collect, use and protect your information.",
    sections: [
      [
        "Information we collect",
        "We collect the information needed to process your order and provide support: your name, phone number, delivery address, order history, and — for bank-deposit orders — payment-verification details such as a transaction reference or proof of payment.",
      ],
      [
        "How it is used",
        "Your information is used to fulfil and confirm orders, provide customer care, prevent fraud, meet legal recordkeeping requirements, and send marketing communications only where you have opted in — for example, by joining our newsletter.",
      ],
      [
        "Sharing",
        "We share only what is necessary with delivery couriers, hosting providers and analytics services that help us run the store. We do not sell your personal information to any third party.",
      ],
      [
        "Your choices",
        "You may ask us to access, correct or delete your personal information, or unsubscribe from marketing communications at any time, by contacting our customer care team through the details on our Contact page.",
      ],
      [
        "Cookies and analytics",
        "We use essential cookies to operate the store and, where you consent, analytics tools to understand how the site is used. You can decline non-essential cookies from the banner shown on your first visit.",
      ],
    ],
  },
  terms: {
    title: "Terms of service",
    intro: "The conditions that govern purchases made from Muse & Silk.",
    sections: [
      [
        "Product information",
        "We aim to describe colours, dimensions, materials and pricing as accurately as possible. Screen displays and the natural variation of handmade or natural materials may produce small, reasonable differences from what is pictured.",
      ],
      [
        "Placing an order",
        "An order is accepted once it has been confirmed — by phone or WhatsApp for cash-on-delivery orders, or once payment has been verified for bank-deposit orders. We may decline or cancel an order affected by a pricing error, unavailable stock, suspected fraud, or where the customer cannot be reached.",
      ],
      [
        "Payments and reservations",
        "We accept Cash on Delivery and Bank Deposit only; online card payment is not currently supported. Cash-on-delivery orders reserve stock for 12 hours pending confirmation; bank-deposit orders reserve stock for 24 hours pending payment verification. Reservations not confirmed or paid within these windows may expire automatically and the stock is released for other customers.",
      ],
      [
        "Returns and cancellations",
        "Returns and exchanges are handled under our Returns policy. Orders may be cancelled before dispatch by contacting us directly; once an order has shipped, our returns process applies instead.",
      ],
      [
        "Liability",
        "Nothing in these terms limits any right that cannot legally be limited. Otherwise, our liability in connection with an order is limited to the value of that order, to the extent permitted by applicable law.",
      ],
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(policies).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const policy = policies[(await params).slug];
  if (!policy) return {};
  return {
    title: policy.title,
    description: policy.intro,
    alternates: { canonical: `/policies/${(await params).slug}` },
  };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = policies[slug];
  if (!policy) notFound();

  return (
    <main>
      <StoreHeader />
      <article className="content-page">
        <header>
          <p className="eyebrow">Customer care</p>
          <h1>{policy.title}</h1>
          <p>{policy.intro}</p>
        </header>
        <div>
          {policy.sections.map(([title, body]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <footer>
          <p>Last updated 29 July 2026. Questions about this policy?</p>
          <Link className="text-link" href="/contact">
            Contact customer care →
          </Link>
        </footer>
      </article>

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
    </main>
  );
}
