import { getAdminUser } from "@/lib/auth/admin-auth";
import { MAX_BULK_ORDERS, previewOrders } from "@/lib/admin-order-placement";

export const dynamic = "force-dynamic";

/** Dry run for the bulk importer: validates every order in an uploaded file against the live
 * catalogue and stock and returns per-order results — writes nothing. Body: { orders: [...] }. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { orders?: unknown } | null;
  if (!body || !Array.isArray(body.orders)) return Response.json({ error: "Request body must be { orders: [...] }." }, { status: 400 });
  if (body.orders.length === 0) return Response.json({ error: "The file contains no orders." }, { status: 400 });
  if (body.orders.length > MAX_BULK_ORDERS) {
    return Response.json({ error: `A file can contain at most ${MAX_BULK_ORDERS} orders (this one has ${body.orders.length}). Split it into smaller files.` }, { status: 400 });
  }

  return Response.json({ results: await previewOrders(body.orders) });
}
