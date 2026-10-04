import { getAdminUser } from "@/lib/auth/admin-auth";
import { placeAdminOrder } from "@/lib/admin-order-placement";

export const dynamic = "force-dynamic";

/** Places ONE order on a customer's behalf (already confirmed). The bulk importer calls this once per
 * order, so each is validated, stock-reserved and idempotency-protected on its own and one bad row
 * can never affect the others. Body: { order: {...}, idempotencyKey?: string }. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { order?: unknown; idempotencyKey?: unknown } | null;
  if (!body || typeof body.order !== "object" || body.order === null) {
    return Response.json({ errors: ["Request body must be { order: {...} }."] }, { status: 400 });
  }
  const key = typeof body.idempotencyKey === "string" && /^[0-9a-f-]{16,64}$/i.test(body.idempotencyKey) ? body.idempotencyKey : undefined;

  const result = await placeAdminOrder(body.order, admin.email, key);
  if (!result.ok) return Response.json({ errors: result.errors }, { status: 422 });
  return Response.json({ order: result.order }, { status: result.order.duplicate ? 200 : 201 });
}
