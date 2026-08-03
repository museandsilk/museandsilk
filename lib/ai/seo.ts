const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

export type SeoFieldsInput = {
  name: string;
  typeLabel?: string;
  categoryName?: string;
  color?: string;
  material?: string;
  shortDescription?: string;
  description?: string;
};

export type SeoFields = { seoTitle: string; seoDescription: string };

/**
 * Drafts the product's SEO title/description from whatever the admin already typed — the admin
 * never sees or edits these directly (per product decision: keep the create-product form simple).
 * Best-effort and silent: called from the product create/update routes, never blocks saving the
 * product if Groq is unavailable or misconfigured, and getProductBySlug/generateMetadata already
 * fall back to the plain name/shortDescription when these are null.
 */
export async function generateSeoFields(input: SeoFieldsInput): Promise<SeoFields | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const details = [
    input.typeLabel && `type: ${input.typeLabel}`,
    input.categoryName && `category: ${input.categoryName}`,
    input.color && `color: ${input.color}`,
    input.material && `material: ${input.material}`,
    (input.shortDescription || input.description) && `description: ${input.shortDescription || input.description}`,
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = `Write SEO metadata for a luxury accessories e-commerce product page.
Product name: "${input.name}"${details ? `\nKnown details: ${details}` : ""}
Brand: Muse & Silk, a modern, premium, understated accessories house (scarves, bandanas, eyewear), nationwide delivery in Pakistan.
Return strict JSON only, no other text, no markdown code fences: {"seoTitle": "...", "seoDescription": "..."}
- seoTitle: under 60 characters, include the product name naturally, no clickbait, no "Buy now"/"Shop now" phrasing.
- seoDescription: under 155 characters, one or two plain sentences describing the product and mentioning nationwide delivery in Pakistan, confident and understated tone, no exclamation marks, no clichés.`;

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        // Deliberately no response_format: json_object — tested against the real API and it
        // rejects this exact prompt/model combination outright (400, empty failed_generation).
        // Plain instructed-JSON output (same approach as lib/ai/description.ts, already proven
        // reliable) works fine; we just parse defensively below in case of stray code fences.
        reasoning_effort: "low",
        max_completion_tokens: 700,
        stream: false,
      }),
    });
    if (!response.ok) return null;

    const data = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
    let content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    content = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

    const parsed = JSON.parse(content) as { seoTitle?: unknown; seoDescription?: unknown };
    if (typeof parsed.seoTitle !== "string" || typeof parsed.seoDescription !== "string") return null;

    return {
      seoTitle: parsed.seoTitle.slice(0, 70).trim(),
      seoDescription: parsed.seoDescription.slice(0, 165).trim(),
    };
  } catch (error) {
    console.error("generateSeoFields failed", error);
    return null;
  }
}
