import { z } from "zod";
import { getAdminUser } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  category: z.string().optional(),
  color: z.string().optional(),
  material: z.string().optional(),
});

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

/** Drafts a product description from just its name (plus whatever else is already filled in) via
 * Groq's hosted inference API — the API key only ever lives on the server (Worker secret), never
 * shipped to the browser. The admin is expected to read over and edit whatever comes back before
 * saving; this is a starting point, not a final copy. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "AI description generation isn't configured." }, { status: 501 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "A product name is required." }, { status: 400 });
  const { name, type, category, color, material } = parsed.data;

  const details = [
    type && `type: ${type}`,
    category && `category: ${category}`,
    color && `color: ${color}`,
    material && `material: ${material}`,
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = `Write a short product description (2-3 sentences, no more than 60 words) for a luxury accessories e-commerce listing.
Product name: "${name}"${details ? `\nKnown details: ${details}` : ""}
Brand voice: modern, premium, understated — confident but never overwrought, no exclamation marks, no clichés like "elevate your style" or "must-have". Write in the third person, present tense. Return only the description text, nothing else (no title, no quotes, no markdown).`;

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        // This model spends hidden "reasoning" tokens before emitting its actual answer, so a
        // short-sounding task still needs real headroom — low effort keeps that overhead small,
        // and the completion budget stays generous so reasoning never crowds out the real content.
        reasoning_effort: "low",
        max_completion_tokens: 700,
        stream: false,
      }),
    });
  } catch {
    return Response.json({ error: "Could not reach the AI service. Please try again." }, { status: 502 });
  }

  if (!response.ok) {
    return Response.json({ error: "The AI service could not generate a description right now." }, { status: 502 });
  }

  const data = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const description = data?.choices?.[0]?.message?.content?.trim();
  if (!description) return Response.json({ error: "The AI service returned an empty response." }, { status: 502 });

  return Response.json({ description });
}
