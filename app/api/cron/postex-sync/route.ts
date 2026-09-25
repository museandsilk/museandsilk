import { isPostexConfigured } from "@/lib/postex";
import { autoBookConfirmedOrders, syncPostexStatuses } from "@/lib/postex-booking";

export const dynamic = "force-dynamic";

/**
 * Called every few minutes by .github/workflows/cron.yml (same Bearer secret as expire-reservations).
 * 1. Books customer-confirmed orders with PostEx (only once POSTEX_AUTO_BOOK_FROM is set — see
 *    lib/postex-booking.ts), 2. refreshes booked parcels' courier status and advances orders.
 * Never returns an error status: a PostEx hiccup must not fail the shared scheduled job, so each step
 * reports its own problem in the body instead.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isPostexConfigured()) return Response.json({ ok: true, skipped: "PostEx is not configured." });

  const result: Record<string, unknown> = { ok: true };
  try {
    result.autoBook = await autoBookConfirmedOrders();
  } catch (error) {
    console.error("PostEx auto-book run failed", error);
    result.autoBookError = error instanceof Error ? error.message : "failed";
  }
  try {
    result.sync = await syncPostexStatuses();
  } catch (error) {
    console.error("PostEx sync run failed", error);
    result.syncError = error instanceof Error ? error.message : "failed";
  }
  return Response.json(result);
}
