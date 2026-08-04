const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verifies a Cloudflare Turnstile token server-side. If TURNSTILE_SECRET_KEY isn't set yet (the
 * admin hasn't created a Turnstile widget in their Cloudflare dashboard), this passes everything
 * through rather than blocking checkout — matches the same "best-effort, never break the core
 * flow over an optional integration" pattern used for GROQ_API_KEY elsewhere in this codebase.
 */
export async function verifyTurnstileToken(token: string | null | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const response = await fetch(VERIFY_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!response.ok) return false;
    const data = (await response.json().catch(() => null)) as { success?: boolean } | null;
    return Boolean(data?.success);
  } catch (error) {
    console.error("verifyTurnstileToken failed", error);
    return false;
  }
}
