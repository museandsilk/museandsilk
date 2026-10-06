import { z } from "zod";
import { getAdminUser } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  name: z.string().min(1).max(160),
  type: z.string().max(80).optional(),
  category: z.string().max(80).optional(),
  color: z.string().max(60).optional(),
  material: z.string().max(120).optional(),
  /** What the owner has already typed. With mode "rewrite" this is polished for Google instead of replaced. */
  existing: z.string().max(2000).optional(),
  mode: z.enum(["write", "rewrite"]).default("write"),
});

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

/** Writes (or rewrites for search engines) a product description via Groq's hosted inference API – the key
 * only ever lives on the server, never in the browser. The owner reads and edits the result before saving;
 * it is a starting point, not final copy. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "The writing helper isn't switched on yet. You can type the description yourself." }, { status: 501 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Please type the product name first." }, { status: 400 });
  const { name, type, category, color, material, existing, mode } = parsed.data;

  const details = [type && `type: ${type}`, category && `category: ${category}`, color && `colour: ${color}`, material && `fabric: ${material}`].filter(Boolean).join(", ");
  const brand = `Brand: Nure Asmir — a Pakistani men's wear label (shalwar kameez, shirts, pants, leather accessories). Tagline "Tradition in a modern form". Delivery all over Pakistan, cash on delivery.`;
  const style = `Voice: calm, premium, honest — no exclamation marks, no clichés like "elevate your style" or "must-have", no made-up facts. Third person, present tense. Natural words a Pakistani shopper would search for (for example the product type, fabric, colour, occasion such as Eid, wedding or office). Return only the description text: no title, no quotes, no markdown, no emoji.`;

  const prompt =
    mode === "rewrite" && existing?.trim()
      ? `Rewrite this product description so it ranks better on Google while staying true to the facts. Keep every fact (fabric, fit, colour, care). Do not invent anything. 60-90 words.\n${brand}\nProduct name: "${name}"${details ? `\nKnown details: ${details}` : ""}\nCurrent description: """${existing.trim()}"""\n${style}`
      : `Write a short product description (2-3 sentences, 40-70 words) for an online men's wear shop.\n${brand}\nProduct name: "${name}"${details ? `\nKnown details: ${details}` : ""}\n${style}`;

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        // This model spends hidden "reasoning" tokens before its answer, so a short task still needs
        // headroom; low effort keeps the overhead small.
        reasoning_effort: "low",
        max_completion_tokens: 900,
        stream: false,
      }),
    });
  } catch {
    return Response.json({ error: "Could not reach the writing helper. Please try again in a moment." }, { status: 502 });
  }
  if (!response.ok) return Response.json({ error: "The writing helper is busy right now. Please try again in a minute." }, { status: 502 });

  const data = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const description = data?.choices?.[0]?.message?.content?.trim().replace(/^["“]|["”]$/g, "");
  if (!description) return Response.json({ error: "The writing helper gave an empty answer. Please try again." }, { status: 502 });

  return Response.json({ description });
}
