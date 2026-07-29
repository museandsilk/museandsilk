import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, paymentProofs } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { getSignedObjectUrl } from "@/lib/r2";
import { auditLogEntry } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, id)).limit(1);
  if (!proof) return Response.json({ error: "Payment proof not found." }, { status: 404 });

  const url = await getSignedObjectUrl(proof.r2Key);
  return Response.json({ proof, url });
}

const updateSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  reviewNote: z.string().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "A valid status is required." }, { status: 400 });
  const { status, reviewNote } = parsed.data;

  const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, id)).limit(1);
  if (!proof) return Response.json({ error: "Payment proof not found." }, { status: 404 });

  const [row] = await db
    .update(paymentProofs)
    .set({ status, reviewNote: reviewNote || null, reviewedBy: admin.email, reviewedAt: new Date() })
    .where(eq(paymentProofs.id, id))
    .returning();

  // Approving a bank-deposit receipt marks the order's payment as verified so the admin can proceed
  // to confirm it; rejecting leaves paymentStatus untouched for the admin to follow up with the customer.
  if (status === "approved") {
    await db.update(orders).set({ paymentStatus: "paid", updatedAt: new Date() }).where(eq(orders.id, proof.orderId));
  }

  await auditLogEntry({
    actorEmail: admin.email,
    action: "payment-proof.review",
    entityType: "order",
    entityId: proof.orderId,
    detail: { proofId: id, status },
  });

  return Response.json({ proof: row });
}
