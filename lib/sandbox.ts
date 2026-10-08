import { sql } from "drizzle-orm";
import { db } from "@/db";
import { hitState, isSandboxEnv, roomMessage, type HitState, type SandboxThing } from "./sandbox-rules";

export { isSandboxEnv, SANDBOX_LIMITS, SANDBOX_THING_LABEL, LIMIT_REACHED_MESSAGE } from "./sandbox-rules";
export type { SandboxThing } from "./sandbox-rules";

/** True on the practice shop only. */
export const isSandbox = (): boolean => isSandboxEnv();

const pakistanDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

type Rows<T> = { rows: T[] };

export async function sandboxHits(): Promise<HitState> {
  try {
    const result = (await db.execute(sql`select hits from sandbox_usage where day = ${pakistanDay()}`)) as unknown as Rows<{ hits: number }>;
    return hitState(Number(result.rows[0]?.hits ?? 0));
  } catch {
    return hitState(0);
  }
}

const TABLE_FOR: Record<SandboxThing, string> = {
  products: "products",
  orders: "orders",
  categories: "categories",
  coupons: "discount_codes",
  flashSales: "flash_sales",
  faqs: "faqs",
  collections: "collections",
  locations: "store_locations",
};

/**
 * Call before creating something on the practice shop. Returns the sentence to show when it is full, or null when there is room
 * (always null on the real shop, so it is safe to call everywhere).
 */
export async function sandboxRoomMessage(thing: SandboxThing): Promise<string | null> {
  if (!isSandbox()) return null;
  try {
    const result = (await db.execute(sql.raw(`select count(*)::int as n from "${TABLE_FOR[thing]}"`))) as unknown as Rows<{ n: number }>;
    return roomMessage(thing, Number(result.rows[0]?.n ?? 0));
  } catch {
    return null;
  }
}

/* ---------------------------- the starting data ---------------------------- */

// Tables that are never copied or wiped: who may sign in, the day counters, and the copy itself.
const KEEP = new Set(["admin_owners", "admin_sessions", "admin_push_devices", "login_attempts", "sandbox_usage", "sandbox_baseline", "api_usage", "admin_audit_log", "error_log"]);

async function dataTables(): Promise<string[]> {
  const result = (await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`)) as unknown as Rows<{ table_name: string }>;
  return result.rows.map((row) => row.table_name).filter((name) => !KEEP.has(name));
}

/** Tables ordered so that a table always comes after the tables it points to (so rows can be put back without breaking a link). */
async function insertOrder(tables: string[]): Promise<string[]> {
  const result = (await db.execute(
    sql`select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`,
  )) as unknown as Rows<{ child: string; parent: string }>;
  const wanted = new Set(tables);
  const needs = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]));
  for (const { child, parent } of result.rows) {
    const c = child.replaceAll('"', "");
    const p = parent.replaceAll('"', "");
    if (c !== p && wanted.has(c) && wanted.has(p)) needs.get(c)?.add(p);
  }
  const ordered: string[] = [];
  const placed = new Set<string>();
  while (ordered.length < tables.length) {
    const next = tables.filter((table) => !placed.has(table) && [...(needs.get(table) ?? [])].every((parent) => placed.has(parent)));
    if (!next.length) {
      ordered.push(...tables.filter((table) => !placed.has(table))); // a circular link: the rest in any order
      break;
    }
    for (const table of next) {
      placed.add(table);
      ordered.push(table);
    }
  }
  return ordered;
}

/** Remembers how every table looks right now as "the starting data". Used once when the practice shop is first set up. */
export async function captureBaseline(): Promise<number> {
  const tables = await dataTables();
  await db.execute(sql`delete from sandbox_baseline`);
  for (const table of tables) {
    await db.execute(sql.raw(`insert into sandbox_baseline (table_name, rows) select '${table}', coalesce(jsonb_agg(t), '[]'::jsonb) from "${table}" t`));
  }
  return tables.length;
}

export async function hasBaseline(): Promise<boolean> {
  try {
    const result = (await db.execute(sql`select 1 as one from sandbox_baseline limit 1`)) as unknown as Rows<{ one: number }>;
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

/** Puts every table back to the starting data in one all-or-nothing step. Sign-ins and today's counters are left alone. */
export async function resetToBaseline(): Promise<{ tables: number }> {
  const saved = (await db.execute(sql`select table_name, rows from sandbox_baseline`)) as unknown as Rows<{ table_name: string; rows: unknown[] }>;
  if (!saved.rows.length) throw new Error("There is no starting data saved yet.");
  const byName = new Map(saved.rows.map((row) => [row.table_name, row.rows]));
  const existing = new Set(await dataTables());
  const tables = (await insertOrder([...byName.keys()].filter((name) => existing.has(name))));
  const wipe = sql.raw(`truncate table ${tables.map((table) => `"${table}"`).join(", ")} restart identity cascade`);
  const refill = tables.map((table) => sql`insert into ${sql.raw(`"${table}"`)} select * from jsonb_populate_recordset(null::${sql.raw(`"${table}"`)}, ${JSON.stringify(byName.get(table) ?? [])}::jsonb)`);
  await db.batch([db.execute(wipe), ...refill.map((statement) => db.execute(statement))] as unknown as Parameters<typeof db.batch>[0]);
  return { tables: tables.length };
}
