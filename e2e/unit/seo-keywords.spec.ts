import { expect, test } from "@playwright/test";
import { googleSearchUrl, seoChecklist, serpPreview, suggestKeywords, type SeoInput } from "../../lib/seo-keywords";

const kurta: SeoInput = { name: "Ivory Cotton Kurta", type: "Kurta", category: "Kurtas", colors: ["Ivory", "Black"], material: "Cotton", description: "", photoCounts: [3, 0], hasPrice: true, shopCities: ["Lahore"] };

test.describe("search phrases", () => {
  test("gives buying, local, occasion and brand phrases that use the product's own words", () => {
    const groups = suggestKeywords(kurta);
    expect(groups.map((g) => g.title)).toEqual(["People ready to buy", "Near you (local search)", "Occasions", "Your brand"]);
    const all = groups.flatMap((g) => g.phrases);
    expect(all).toContain("kurta for men");
    expect(all).toContain("kurta in lahore");
    expect(all).toContain("black kurta for men");
    expect(all).toContain("kurta for eid");
    expect(all).toContain("nure asmir kurta");
    expect(new Set(all).size, "no duplicates").toBe(all.length);
    expect(all.every((p) => p === p.toLowerCase())).toBe(true);
  });

  test("nothing to suggest until the product has a name or type; trousers get trouser words", () => {
    expect(suggestKeywords({ ...kurta, name: "", type: "" })).toEqual([]);
    const pants = suggestKeywords({ ...kurta, name: "Olive Cargo", type: "Cargo Pants", colors: ["Olive"] }).flatMap((g) => g.phrases);
    expect(pants.some((p) => p.includes("trousers"))).toBe(true);
    expect(pants.some((p) => p.includes("for office"))).toBe(true);
  });

  test("Google links search from Pakistan and escape the phrase", () => {
    expect(googleSearchUrl("kurta & shalwar")).toBe("https://www.google.com/search?q=kurta%20%26%20shalwar&gl=pk&hl=en");
  });
});

test.describe("SEO checklist", () => {
  test("tells the owner exactly what is missing, and passes a well-described product", () => {
    const weak = seoChecklist({ ...kurta, name: "K", description: "Nice.", photoCounts: [1, 0], hasPrice: false });
    expect(weak.filter((c) => !c.ok).map((c) => c.label)).toEqual(expect.arrayContaining(["The name is clear and not too long", "The description has at least 40 words", "Every colour has its own photo", "A price is set"]));
    const description = "This ivory cotton kurta is cut for a relaxed, tailored fit and stays cool through long summer days. ".repeat(3);
    const good = seoChecklist({ ...kurta, description, photoCounts: [3, 3] });
    expect(good.every((c) => c.ok)).toBe(true);
  });

  test("the Google preview trims long text and falls back to the product's own description", () => {
    const long = serpPreview({ name: "Ivory Cotton Kurta", description: "x".repeat(300) });
    expect(long.title).toBe("Ivory Cotton Kurta | Nure Asmir");
    expect(long.description.length).toBeLessThanOrEqual(156);
    expect(serpPreview({ name: "A", seoTitle: "Set title", seoDescription: "Set text" })).toEqual({ title: "Set title", description: "Set text" });
  });
});
