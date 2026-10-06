import { asc, count } from "drizzle-orm";
import { db } from "@/db";
import { faqs } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";
import { faqSchema, MAX_FAQS } from "@/lib/faqs";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ faqs: await db.select().from(faqs).orderBy(asc(faqs.sortOrder), asc(faqs.createdAt)) });
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = faqSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid question." }, { status: 400 });
  const [{ n }] = await db.select({ n: count() }).from(faqs);
  if (n >= MAX_FAQS) return Response.json({ error: `You can keep up to ${MAX_FAQS} questions.` }, { status: 400 });
  const [row] = await db.insert(faqs).values({ question: parsed.data.question, answer: parsed.data.answer, active: parsed.data.active ?? true, sortOrder: n }).returning();
  await auditLogEntry({ actorEmail: admin.email, action: "faq.create", entityType: "faq", entityId: row.id, detail: { question: row.question } });
  return Response.json({ faq: row }, { status: 201 });
}
