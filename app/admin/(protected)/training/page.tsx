import { PageHeader } from "../../_ui/ui";
import { TrainingView } from "./training-view";

export const metadata = { title: "Training" };

const ROUTINE: Array<[string, string]> = [
  ["Morning (5 minutes)", "Open Home. Work through “To do now”: confirm new orders, check bank receipts, book TCS for packed orders."],
  ["After lunch (2 minutes)", "Look at Stock → Running low. Reorder anything with 1–2 left. Reply to WhatsApp messages."],
  ["Evening (5 minutes)", "Check Refunds and any orders that stayed on “Needs you”. Add a product or two with a good photo."],
  ["Every week", "Add or refresh 3–5 products, post on Instagram, check how the shop is doing for 7 and 30 days."],
  ["Every month", "Check Search Console (which phrases bring people), update prices for the season, and look at Settings → Advanced."],
];

const ANSWERS: Array<[string, string]> = [
  ["A customer wants to cancel. Can I?", "Yes, until TCS has collected the parcel. After that the Cancel button is off – ask the customer to refuse delivery, or use returns."],
  ["I made a mistake in a price.", "Stock → open the product → change the price → Save on that row. The website updates in seconds."],
  ["A product shows “Sold out” but I have it.", "Stock → open it → raise the In stock number → Save. “Held” numbers are for orders not delivered yet."],
  ["I added the same shirt in another colour as a separate product.", "Open one product, press “Add another colour”, add the colour there, then hide or delete the duplicate."],
  ["I forgot my password.", "Ask the developer to reset it. Never share it on WhatsApp."],
  ["Something looks broken.", "Press F5 once. If it is still wrong, WhatsApp the developer with the page name and a screenshot."],
];

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ lesson?: string }> }) {
  const { lesson } = await searchParams;
  return (
    <>
      <PageHeader title="Training" intro="Short, self-playing lessons that show exactly where to click. Press Play and watch, or step through yourself. Nothing here changes your real shop." />
      <TrainingView initialLesson={lesson} />

      <div className="a-split" style={{ marginTop: 22 }}>
        <section className="a-card">
          <header className="a-card-head"><h2>A good day, in order</h2></header>
          <ul style={{ listStyle: "none", margin: 0, padding: "6px 22px 18px", display: "grid", gap: 12 }}>
            {ROUTINE.map(([when, what]) => (
              <li key={when}><strong>{when}</strong><div className="a-muted">{what}</div></li>
            ))}
          </ul>
        </section>
        <section className="a-card">
          <header className="a-card-head"><h2>Quick answers</h2></header>
          <ul style={{ listStyle: "none", margin: 0, padding: "6px 22px 18px", display: "grid", gap: 12 }}>
            {ANSWERS.map(([q, a]) => (
              <li key={q}><strong>{q}</strong><div className="a-muted">{a}</div></li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
