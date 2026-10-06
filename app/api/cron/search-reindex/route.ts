import { reindexAll } from "@/lib/search/algolia";

export const dynamic = "force-dynamic";

/** Nightly safety net: rebuilds the Algolia index from the database so it can never drift
 * (e.g. stock sold out through checkout, which doesn't go through the admin routes). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await reindexAll());
  } catch (error) {
    console.error("Algolia reindex failed", error);
    return Response.json({ error: "Reindex failed" }, { status: 500 });
  }
}
