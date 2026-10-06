import { buildSearchDocs } from "@/lib/search/docs";

/**
 * The product list for the built-in fallback search (lib/search/local.ts). Only ever requested by a
 * browser that Algolia has just refused, so normally nobody calls it. Cached at the edge and in the
 * browser for a few minutes.
 */
export async function GET() {
  const docs = await buildSearchDocs();
  return Response.json(docs, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=900" } });
}
