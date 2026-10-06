import { cache } from "react";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { faqs } from "@/db/schema";

export const MAX_FAQS = 60;

export const faqSchema = z.object({
  question: z.string().trim().min(3, "Please type the question.").max(200),
  answer: z.string().trim().min(3, "Please type the answer.").max(2000),
  active: z.boolean().optional(),
});

export type FaqItem = { id: string; question: string; answer: string; sortOrder: number; active: boolean };

/** {{codHours}}, {{freeAbove}} and {{refundDays}} in an answer are replaced by the shop's real settings, so the text can never go out of date. */
export function fillFaqTokens(text: string, values: { codHours: number; freeAbove: number; refundDays: number }): string {
  return text
    .replace(/\{\{\s*codHours\s*\}\}/g, String(values.codHours))
    .replace(/\{\{\s*freeAbove\s*\}\}/g, values.freeAbove.toLocaleString("en-PK"))
    .replace(/\{\{\s*refundDays\s*\}\}/g, String(values.refundDays));
}

export const getActiveFaqs = cache(async (): Promise<FaqItem[]> =>
  db.select().from(faqs).where(eq(faqs.active, true)).orderBy(asc(faqs.sortOrder), asc(faqs.createdAt)),
);
