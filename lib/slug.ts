export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function cleanPhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

/** Purely presentational crop hint per category, so scarves/bandanas/eyewear each get a
 * complementary framing in product cards and galleries without storing this on every product row.
 * Plain function (no "use client") so both server and client components can call it directly. */
export function cropForCategory(category: string): "left" | "center" | "right" {
  if (category === "glasses") return "right";
  if (category === "bandanas") return "center";
  return "left";
}
