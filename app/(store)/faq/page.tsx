import type { Metadata } from "next";
import Link from "next/link";
import { StoreHeader } from "../_components/store-components";
import { StoreFooter } from "../_components/store-footer";
import { getPublicSettings } from "@/lib/commerce";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to common questions about Muse & Silk orders — delivery, cash on delivery, bank deposit, returns, and sizing.",
  alternates: { canonical: "/faq" },
};

export default async function FaqPage() {
  const settings = await getPublicSettings();
  const threshold = settings.freeDeliveryThreshold.toLocaleString("en-PK");

  const faqs: [string, string][] = [
    [
      "Do you offer cash on delivery?",
      `Yes. Cash on delivery is available nationwide. Once you place a COD order, we reserve your stock for ${settings.codReservationHours} hours while we confirm the order.`,
    ],
    [
      "Can I pay by bank deposit instead?",
      `Yes — bank deposit is our other accepted payment method. Your stock is reserved for ${settings.bankReservationHours} hours so you have time to make the deposit and upload your payment proof; we verify it before dispatch. We don't yet accept online card payment.`,
    ],
    [
      "How much is delivery, and is it ever free?",
      `Delivery is charged by zone, not by parcel weight — the exact charge for your area is shown at checkout before you place your order. Delivery is complimentary on orders that reach PKR ${threshold}.`,
    ],
    [
      "How long does delivery take?",
      "Most orders arrive within 2–5 working days of confirmation, depending on your delivery zone — the estimated window for your specific area is shown at checkout. Remote areas may take a little longer.",
    ],
    [
      "How do I know which size or fit to choose?",
      "Each product page lists exact dimensions under \"Dimensions & care\", along with material and finish notes, so you can check the measurements before ordering. Scarves and bandanas are one size; eyewear frame details are listed per style. If you're unsure, write to us before ordering and we'll help you choose.",
    ],
    [
      "What if I need to return or exchange something?",
      "We offer returns and exchanges under our Returns policy — inspect your parcel promptly and contact us within 48 hours if anything arrives damaged, incomplete, or different from what you ordered.",
    ],
    [
      "How do I track my order?",
      "Use the Track your order page with your order number and phone number to see its current status at any time.",
    ],
    [
      "How can I reach you with a question before ordering?",
      "Message us on WhatsApp or through the Contact page — a person, not a script, will answer.",
    ],
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <main>
      <StoreHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="content-page">
        <header>
          <p className="eyebrow">Customer care</p>
          <h1>Frequently asked questions</h1>
          <p>Straight answers on delivery, payment, returns and sizing — no digging through policy pages required.</p>
        </header>
        <div className="product-accordions faq-accordions">
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question} <span>+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        <footer>
          <p>Still have a question?</p>
          <Link className="text-link" href="/contact">
            Contact customer care →︎
          </Link>
        </footer>
      </article>

      <StoreFooter />
    </main>
  );
}
