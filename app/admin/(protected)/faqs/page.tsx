import { asc } from "drizzle-orm";
import { db } from "@/db";
import { faqs } from "@/db/schema";
import { HelpBox } from "../../_ui/client";
import { PageHeader } from "../../_ui/ui";
import { FaqManager, type FaqRow } from "./faq-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Questions & answers" };

export default async function FaqsPage() {
  const rows = await db.select().from(faqs).orderBy(asc(faqs.sortOrder), asc(faqs.createdAt));
  const items: FaqRow[] = rows.map((r) => ({ id: r.id, question: r.question, answer: r.answer, active: r.active }));
  return (
    <>
      <PageHeader title="Questions & answers" intro="The FAQ page of your website. Change the words, add new questions, and put them in the order you like." />
      <HelpBox id="faqs">
        <ol>
          <li>Press <strong>Add a question</strong>, type the question and the answer, and save. It appears on your website within a minute.</li>
          <li>Use the <strong>↑ ↓</strong> buttons to change the order. Hide a question with <strong>Hide</strong> – it is kept, but customers do not see it.</li>
          <li>
            In an answer you can type <code>{"{{codHours}}"}</code> (hours we hold a cash-on-delivery order), <code>{"{{freeAbove}}"}</code> (the free-delivery amount) and <code>{"{{refundDays}}"}</code> (refund days). They are replaced by your real settings, so the answer is always right.
          </li>
        </ol>
      </HelpBox>
      <FaqManager initial={items} />
    </>
  );
}
