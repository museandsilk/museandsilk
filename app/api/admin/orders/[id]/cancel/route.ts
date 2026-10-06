import { z } from "zod";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { cancelOrder } from "@/lib/order-actions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().min(1).max(60), note: z.string().max(300).optional() });

/** Cancels an order – allowed only until TCS has the parcel (lib/order-rules.ts). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Please choose why you are cancelling this order." }, { status: 400 });

  const result = await cancelOrder(id, { kind: "admin", email: admin.email }, parsed.data.reason, parsed.data.note);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true, courierWarning: result.courierWarning ?? null, refundOpened: result.refundOpened });
}
