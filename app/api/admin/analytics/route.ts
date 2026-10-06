import { getAdminUser } from "@/lib/auth/admin-auth";
import { getAnalytics, isRangeKey } from "@/lib/admin/analytics";

export const dynamic = "force-dynamic";

/** The Home screen's numbers for one period – fetched in place so changing the period never reloads the page. */
export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const range = new URL(request.url).searchParams.get("range") ?? undefined;
  const data = await getAnalytics(isRangeKey(range) ? range : "7d");
  return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
