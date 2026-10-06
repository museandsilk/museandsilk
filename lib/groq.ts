import { trackedFetch, type ServiceName } from "@/lib/usage";

/**
 * Groq with several keys. Each call starts at the next key in turn (round robin) so the free allowance of every key is used
 * evenly; a key that is rate-limited or rejected is set aside for a while, and the call moves on to the next key. If every key
 * fails the caller gets a plain "not available" result – the website never breaks because the writing helper is busy.
 *
 * Keys: GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3 … (up to _9), and/or a comma-separated GROQ_API_KEYS.
 */
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "openai/gpt-oss-120b";

const USAGE_NAMES: ServiceName[] = ["groq", "groq-2", "groq-3"];
const usageNameFor = (index: number): ServiceName => USAGE_NAMES[index] ?? "groq-3";

export function groqKeys(env: Record<string, string | undefined> = process.env): string[] {
  const found: string[] = [];
  const add = (value: string | undefined) => {
    const key = (value ?? "").trim();
    if (key && !found.includes(key)) found.push(key);
  };
  add(env.GROQ_API_KEY);
  for (let n = 2; n <= 9; n++) add(env[`GROQ_API_KEY_${n}`]);
  for (const part of (env.GROQ_API_KEYS ?? "").split(",")) add(part);
  return found;
}

let cursor = Math.floor(Math.random() * 1000);
const restingUntil = new Map<string, number>();

/** The order to try keys in right now: next-in-turn first, keys that are resting last. Exported for tests. */
export function keyOrder(keys: string[], turn: number, now = Date.now()): number[] {
  const indexes = keys.map((_, i) => i);
  const start = keys.length ? turn % keys.length : 0;
  const rotated = [...indexes.slice(start), ...indexes.slice(0, start)];
  const ready = rotated.filter((i) => (restingUntil.get(keys[i]) ?? 0) <= now);
  const resting = rotated.filter((i) => (restingUntil.get(keys[i]) ?? 0) > now);
  return [...ready, ...resting];
}

export function restKey(key: string, ms: number, now = Date.now()) {
  restingUntil.set(key, now + ms);
}

export type GroqResult = { ok: true; content: string } | { ok: false; reason: "unconfigured" | "unavailable" };

export async function groqChat(body: Record<string, unknown>): Promise<GroqResult> {
  const keys = groqKeys();
  if (!keys.length) return { ok: false, reason: "unconfigured" };
  const turn = cursor++;

  for (const index of keyOrder(keys, turn)) {
    const key = keys[index];
    try {
      const response = await trackedFetch(usageNameFor(index), GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: GROQ_MODEL, stream: false, ...body }),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 429) {
        const wait = Number(response.headers.get("retry-after"));
        restKey(key, Math.min(Math.max(Number.isFinite(wait) && wait > 0 ? wait * 1000 : 60_000, 10_000), 15 * 60_000));
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        restKey(key, 30 * 60_000); // a bad or disabled key: leave it alone for a while
        continue;
      }
      if (!response.ok) continue; // 5xx or a bad request: try the next key rather than fail
      const data = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (content) return { ok: true, content };
    } catch {
      // network error or timeout: try the next key
    }
  }
  return { ok: false, reason: "unavailable" };
}
