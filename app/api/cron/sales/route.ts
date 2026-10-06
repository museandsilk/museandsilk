import { announceStartedSales } from "@/lib/sales-alerts";
import { reconcileReservedStock } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** 5-minute housekeeping: announce flash sales that just went live, and repair any reserved-stock
 * drift (e.g. a Worker killed between reserving stock and writing the order). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [sales, reconciled] = await Promise.all([announceStartedSales(), reconcileReservedStock()]);
  return Response.json({ ...sales, ...reconciled });
}
