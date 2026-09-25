import { z } from "zod";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { isPostexConfigured } from "@/lib/postex";
import { autoBookConfirmedOrders, syncPostexStatuses } from "@/lib/postex-booking";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ orderId: z.string().uuid().optional() });

/** The admin's "Sync PostEx" buttons. With an orderId it refreshes just that order; without one it
 * runs everything the scheduled job would (auto-booking, then a forced status refresh), so an admin
 * who doesn't want to wait for the next 5-minute run never has to. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPostexConfigured()) return Response.json({ error: "PostEx isn't configured yet." }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { orderId } = parsed.data;

  try {
    const autoBook = orderId ? undefined : await autoBookConfirmedOrders();
    const sync = await syncPostexStatuses({ orderId, force: true });
    return Response.json({ autoBook, sync });
  } catch (error) {
    console.error("Admin PostEx sync failed", error);
    return Response.json({ error: "Could not sync with PostEx. Please try again." }, { status: 502 });
  }
}
