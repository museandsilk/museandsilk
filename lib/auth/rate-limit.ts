import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

export async function recordLoginAttempt(email: string, ip: string, success: boolean): Promise<void> {
  await db.insert(loginAttempts).values({ email: email.toLowerCase(), ip, success });
}

export async function isLoginRateLimited(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const failed = await db
    .select({ count: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, email.toLowerCase()),
        eq(loginAttempts.success, false),
        gt(loginAttempts.createdAt, since),
      ),
    );
  const byEmail = Number(failed[0]?.count ?? 0) >= MAX_ATTEMPTS;

  const failedByIp = await db
    .select({ count: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
  const byIp = Number(failedByIp[0]?.count ?? 0) >= MAX_ATTEMPTS * 3;

  return byEmail || byIp;
}

const checkoutAttempts = new Map<string, number[]>();
const CHECKOUT_WINDOW_MS = 60 * 1000;
const CHECKOUT_MAX = 8;

/** In-memory best-effort limiter for the checkout endpoint (per-Worker-isolate; the DB-backed order
 * idempotency key is the real duplicate-order guard — this only throttles abusive request bursts). */
export function isCheckoutRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (checkoutAttempts.get(ip) ?? []).filter((t) => now - t < CHECKOUT_WINDOW_MS);
  timestamps.push(now);
  checkoutAttempts.set(ip, timestamps);
  return timestamps.length > CHECKOUT_MAX;
}
