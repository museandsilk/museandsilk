/** First letters of the words in a text, e.g. "Olive Cargo Pants" → "OCP" (at least 2 characters). */
export function initials(text: string, n: number): string {
  const letters = text
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, n)
    .toUpperCase();
  return letters.padEnd(Math.min(n, 2), "X");
}

/** A readable product code for one size, e.g. NA-PA-OCP-32 – or NA-SH-LIN-OLI-M when the product has several colours. The owner can change it; it only has to be unique. */
export function suggestSku(name: string, type: string, size: string, color = ""): string {
  const colorCode = color.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  const base = `NA-${initials(type || "ITM", 2)}-${initials(name || "NEW", 3)}${colorCode ? `-${colorCode}` : ""}`;
  return size ? `${base}-${size.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}` : base;
}
