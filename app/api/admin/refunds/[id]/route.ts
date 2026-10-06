import { z } from "zod";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { reviewRefund } from "@/lib/refunds";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), note: z.string().max(500).optional(), amount: z.coerce.number().int().min(1).optional() }),
  z.object({ action: z.literal("reject"), note: z.string().trim().min(3, "Please tell the customer why.").max(500) }),
  z.object({ action: z.literal("refunded"), amount: z.coerce.number().int().min(1), reference: z.string().trim().min(2, "Please type the payment reference (so you can find it later).").max(80), note: z.string().max(500).optional() }),
  z.object({ action: z.literal("return_tracking"), trackingNumber: z.string().trim().min(4).max(40) }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Please check the details." }, { status: 400 });
  const result = await reviewRefund(id, admin.email, parsed.data);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true, request: result.request });
}
