import { z } from "zod";
import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  firstName: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { email, firstName } = parsed.data;
  const now = new Date();

  await db
    .insert(subscribers)
    .values({
      email,
      firstName: firstName || null,
      source: "website",
      status: "subscribed",
      consentAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscribers.email,
      set: {
        status: "subscribed",
        consentAt: now,
        updatedAt: now,
        firstName: sql`coalesce(${firstName || null}, ${subscribers.firstName})`,
      },
    });

  return Response.json({ ok: true }, { status: 201 });
}
