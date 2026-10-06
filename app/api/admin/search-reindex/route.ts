import { getAdminUser } from "@/lib/auth/admin-auth";
import { runInBackground } from "@/lib/background";
import { reindexAll } from "@/lib/search/algolia";
import { refreshStorefront } from "@/lib/storefront-cache";

export const dynamic = "force-dynamic";

/** Rebuilds the website search once, after a big upload (instead of once per product). */
export async function POST() {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  runInBackground(reindexAll(), "reindexAll");
  refreshStorefront(true);
  return Response.json({ ok: true });
}
