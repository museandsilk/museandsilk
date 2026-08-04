import { createHash, randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { checkoutVerifications } from "@/db/schema";

const OTP_TTL_MS = 10 * 60 * 1000; // code itself expires after 10 minutes
const VERIFIED_TTL_MS = 30 * 60 * 1000; // once verified, the token stays usable for 30 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_PER_EMAIL_WINDOW_MS = 30 * 60 * 1000;
const MAX_PER_EMAIL = 3;
const MAX_PER_IP_WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 5;
const MAX_VERIFY_ATTEMPTS = 5;

// OTPs are short-lived, single-use, and already rate-limited on both request and guess — a fast
// SHA-256 digest is appropriate here, unlike admin passwords (see lib/auth/password.ts), which use
// scrypt because they're long-lived and worth a slow hash.
function hashOtp(code: string, id: string): string {
  return createHash("sha256").update(`${id}:${code}`).digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type OtpRequestOutcome =
  | { ok: true; code: string; verificationId: string }
  | { ok: false; reason: "cooldown" | "rate_limited_email" | "rate_limited_ip"; retryAfterSeconds?: number };

/** Checks all three request-side limits (60s resend cooldown, 3/30min per email, 5/hour per IP),
 * and if none trip, inserts a fresh pending verification row and returns the plaintext code to
 * email to the customer (the code itself is never stored — only its hash). */
export async function requestOtp(email: string, ip: string): Promise<OtpRequestOutcome> {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();

  const recentForEmail = await db
    .select({ createdAt: checkoutVerifications.createdAt })
    .from(checkoutVerifications)
    .where(and(eq(checkoutVerifications.email, normalizedEmail), gt(checkoutVerifications.createdAt, new Date(now - MAX_PER_EMAIL_WINDOW_MS))));

  if (recentForEmail.length) {
    const mostRecentMs = Math.max(...recentForEmail.map((row) => row.createdAt.getTime()));
    const sinceLastMs = now - mostRecentMs;
    if (sinceLastMs < RESEND_COOLDOWN_MS) {
      return { ok: false, reason: "cooldown", retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - sinceLastMs) / 1000) };
    }
  }
  if (recentForEmail.length >= MAX_PER_EMAIL) {
    return { ok: false, reason: "rate_limited_email" };
  }

  const recentForIp = await db
    .select({ id: checkoutVerifications.id })
    .from(checkoutVerifications)
    .where(and(eq(checkoutVerifications.ip, ip), gt(checkoutVerifications.createdAt, new Date(now - MAX_PER_IP_WINDOW_MS))));
  if (recentForIp.length >= MAX_PER_IP) {
    return { ok: false, reason: "rate_limited_ip" };
  }

  const code = generateOtpCode();
  const [row] = await db
    .insert(checkoutVerifications)
    .values({
      email: normalizedEmail,
      ip,
      otpHash: "", // filled in immediately below once we have the row id (the hash is keyed by id)
      expiresAt: new Date(now + OTP_TTL_MS),
    })
    .returning({ id: checkoutVerifications.id });

  await db.update(checkoutVerifications).set({ otpHash: hashOtp(code, row.id) }).where(eq(checkoutVerifications.id, row.id));

  return { ok: true, code, verificationId: row.id };
}

export type OtpVerifyOutcome =
  | { ok: true; verifiedToken: string }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "incorrect" };

/** Verifies a submitted code against the most recent pending (unverified, unexpired) request for
 * this email. On success, mints a one-time verifiedToken that /api/orders checks before creating
 * the order — the raw code is never passed any further than this call. */
export async function verifyOtp(email: string, code: string, ip: string): Promise<OtpVerifyOutcome> {
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  // Most recent unverified row for this email — guards against an older row lingering if the
  // customer requested several codes before finally verifying one.
  const candidates = await db
    .select()
    .from(checkoutVerifications)
    .where(and(eq(checkoutVerifications.email, normalizedEmail), eq(checkoutVerifications.verified, false)))
    .orderBy(desc(checkoutVerifications.createdAt))
    .limit(1);
  const latest = candidates[0];
  if (!latest) return { ok: false, reason: "not_found" };

  if (latest.expiresAt.getTime() < now.getTime()) return { ok: false, reason: "expired" };
  if (latest.attempts >= MAX_VERIFY_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  if (hashOtp(code.trim(), latest.id) !== latest.otpHash) {
    await db.update(checkoutVerifications).set({ attempts: latest.attempts + 1 }).where(eq(checkoutVerifications.id, latest.id));
    return { ok: false, reason: "incorrect" };
  }

  const verifiedToken = randomUUID();
  await db
    .update(checkoutVerifications)
    .set({ verified: true, verifiedToken, verifiedUntil: new Date(now.getTime() + VERIFIED_TTL_MS), ip })
    .where(eq(checkoutVerifications.id, latest.id));

  return { ok: true, verifiedToken };
}

/** Called from /api/orders — confirms the given token was actually issued to this email and is
 * still within its validity window. */
export async function isOtpTokenValid(email: string, token: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const [row] = await db
    .select({ verifiedUntil: checkoutVerifications.verifiedUntil })
    .from(checkoutVerifications)
    .where(and(eq(checkoutVerifications.email, normalizedEmail), eq(checkoutVerifications.verifiedToken, token), eq(checkoutVerifications.verified, true)))
    .limit(1);
  if (!row?.verifiedUntil) return false;
  return row.verifiedUntil.getTime() > Date.now();
}
