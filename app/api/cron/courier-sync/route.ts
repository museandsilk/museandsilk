import { syncCourierStatuses } from "@/lib/courier";
import { isTcsConfigured } from "@/lib/tcs";

export const dynamic = "force-dynamic";

/**
 * Called every few minutes by .github/workflows/cron.yml (same Bearer secret as the other cron routes):
 * refreshes each booked parcel's TCS status, marks orders "With TCS" when TCS collects them (after which
 * they can no longer be cancelled) and "Delivered" / "Returned" when TCS says so. Never returns an error
 * status: a TCS hiccup must not fail the shared scheduled job.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!isTcsConfigured()) return Response.json({ ok: true, skipped: "TCS is not configured." });
  try {
    return Response.json({ ok: true, sync: await syncCourierStatuses() });
  } catch (error) {
    console.error("TCS sync run failed", error);
    return Response.json({ ok: true, syncError: error instanceof Error ? error.message : "failed" });
  }
}
