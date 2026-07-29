import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
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

// neon-serverless uses WebSockets for its Pool connections. In Node (local dev, and the
// OpenNext Cloudflare Workers build both run on a Node-compatible runtime here) we point it at
// the `ws` package; Cloudflare Workers' native WebSocket global is used automatically otherwise.
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

const pool = new Pool({ connectionString: requireDatabaseUrl() });

// A real Postgres transaction (BEGIN/COMMIT/ROLLBACK) — unlike `neon-http`, this driver supports
// `db.transaction(async (tx) => {...})`, which matters for order creation and admin writes that
// touch multiple tables and must never partially commit.
export const db = drizzle(pool, { schema });
export { schema };
