// Server search for the /search page: Algolia first, the built-in engine (searching the live catalogue
// records) if Algolia refuses or is unreachable. Returns product ids in relevance order.

import { algoliasearch } from "algoliasearch";
import type MiniSearch from "minisearch";
import { isQuotaError } from "./quota";
import type { SearchDoc } from "./types";

let localCache: { at: number; index: MiniSearch<SearchDoc>; search: typeof import("./local").searchLocal } | null = null;
const LOCAL_TTL_MS = 5 * 60 * 1000;

async function localIds(query: string, limit: number): Promise<string[]> {
  if (!localCache || Date.now() - localCache.at > LOCAL_TTL_MS) {
    const [{ buildLocalIndex, searchLocal }, { buildSearchDocs }] = await Promise.all([import("./local"), import("./docs")]);
    localCache = { at: Date.now(), index: buildLocalIndex(await buildSearchDocs()), search: searchLocal };
  }
  return localCache.search(localCache.index, query, limit).hits.map((hit) => hit.objectID);
}

export async function searchProductIds(query: string, limit = 48): Promise<{ ids: string[]; engine: "algolia" | "local" }> {
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const key = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
  if (appId && key && process.env.NEXT_PUBLIC_SEARCH_ENGINE !== "local") {
    try {
      const client = algoliasearch(appId, key);
      const { hits } = await client.searchSingleIndex<{ objectID: string }>({
        indexName: process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME || "nure_asmir_products",
        searchParams: { query, hitsPerPage: limit, attributesToRetrieve: ["objectID"] },
      });
      return { ids: hits.map((hit) => hit.objectID), engine: "algolia" };
    } catch (error) {
      console.error(isQuotaError(error) ? "Algolia allowance used up – using built-in search" : "Algolia unreachable – using built-in search", error);
    }
  }
  return { ids: await localIds(query, limit), engine: "local" };
}
