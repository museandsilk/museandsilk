import { recordApiCall } from "@/lib/usage";

export const dynamic = "force-dynamic";

/**
 * Visitors' browsers search Algolia directly (fast, and never touches our server), so the only way to count those searches is for
 * the browser to tell us after each one. Only that one service is accepted, only from our own pages, and nothing else is stored.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return new Response(null, { status: 403 });
  const body = (await request.json().catch(() => null)) as { service?: unknown; ok?: unknown } | null;
  if (body?.service !== "algolia") return new Response(null, { status: 400 });
  await recordApiCall("algolia", body.ok !== false, body.ok === false ? "browser search failed" : "");
  return new Response(null, { status: 204 });
}
