import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon Postgres connection string.",
    );
  }
  return url;
}

// IMPORTANT: this MUST stay the stateless, per-query HTTP driver (fetch-based), not the
// Pool-based `neon-serverless` driver. Cloudflare Workers forbids reusing an I/O object (sockets,
// streams, etc.) across different requests — each request gets its own isolated I/O context, even
// when the same Worker isolate handles multiple requests over time. A WebSocket connection pool is
// exactly this kind of long-lived cross-request state, and using one here caused real, reproduced
// production failures: "Cannot perform I/O on behalf of a different request" and "Network
// connection lost" errors surfacing as intermittent Error 1101s on every route. `neon-http` issues
// a fresh, independent fetch() per query, so nothing is ever held open between requests.
//
// The tradeoff: this driver does not support `db.transaction(async (tx) => {...})` — it throws
// "No transactions support in neon-http driver" if called. Multi-statement writes that need
// atomicity (order creation, reservation expiry) use guarded sequential awaits instead — see
// app/api/orders/route.ts and lib/orders.ts for the pattern (a conditional UPDATE with a WHERE
// guard acts as the atomicity check, since Postgres itself still applies each statement safely).
const sql = neon(requireDatabaseUrl());

export const db = drizzle(sql, { schema });
export { schema };
