/**
 * Search phrases and a plain-language SEO checklist for one product – shown while the owner adds it, so the product is described
 * with the words Pakistani shoppers (and AI assistants answering them) actually use. Pure functions: no network, easy to test.
 */
export type SeoInput = {
  name: string;
  type: string;
  category?: string;
  colors: string[];
  material?: string;
  shortDescription?: string;
  description?: string;
  photoCounts: number[];
  hasPrice: boolean;
  /** Cities with a shop (for "near me" style phrases). */
  shopCities?: string[];
};

export type KeywordGroup = { title: string; why: string; phrases: string[] };
export type CheckItem = { ok: boolean; label: string; tip: string };

const CITIES = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan"];

/** Other words shoppers use for the same thing (the same families as the shop's search synonyms). */
const SYNONYMS: Array<[RegExp, string[]]> = [
  [/shalwar|salwar|kameez|qameez/i, ["shalwar kameez", "salwar kameez", "kameez shalwar"]],
  [/kurta|kurtah/i, ["kurta", "kurta for men", "men's kurta"]],
  [/waist\s?coat|vest|gilet/i, ["waistcoat", "waist coat"]],
  [/t-?shirt|tee/i, ["t-shirt", "tee shirt", "polo shirt"]],
  [/shirt/i, ["casual shirt", "formal shirt", "men's shirt"]],
  [/pant|trouser|chino|cargo|jean/i, ["trousers", "pants", "chinos", "cargo pants"]],
  [/wallet|card ?holder|purse/i, ["leather wallet", "men's wallet", "card holder"]],
  [/belt/i, ["leather belt", "men's belt"]],
];

function occasionsFor(type: string): string[] {
  if (/shalwar|kameez|kurta|waist/i.test(type)) return ["for Eid", "for wedding", "for mehndi", "for Friday prayers", "for formal events"];
  if (/pant|trouser|chino|cargo|jean/i.test(type)) return ["for office", "for casual wear", "for winter"];
  if (/shirt|tee|polo/i.test(type)) return ["for office", "for casual wear", "for summer"];
  return ["as a gift for men", "for daily use"];
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const uniq = (list: string[]) => [...new Set(list.map((item) => clean(item).toLowerCase()).filter((item) => item.length > 3))];

export function suggestKeywords(input: SeoInput): KeywordGroup[] {
  const type = clean(input.type).toLowerCase();
  const name = clean(input.name).toLowerCase();
  if (!type && !name) return [];
  const colors = uniq(input.colors).slice(0, 4);
  const material = clean(input.material ?? "").toLowerCase();
  const core = type || name;
  const synonyms = SYNONYMS.filter(([pattern]) => pattern.test(`${type} ${name}`)).flatMap(([, words]) => words);
  // Plain product words only ("kurta", not "men's kurta for men"), so the phrases below never repeat "for men".
  const plain = (word: string) => clean(word.replace(/men'?s/gi, "").replace(/for men/gi, ""));
  const names = uniq([core, ...synonyms].map(plain)).slice(0, 4);
  const cities = uniq([...(input.shopCities ?? []), ...CITIES]).map((city) => city.replace(/^./, (c) => c.toUpperCase())).slice(0, 5);

  // The most specific phrases (colour, fabric) come first: they are the ones a shopper with a clear idea types.
  const buying = uniq([
    ...colors.map((color) => `${color} ${core} for men`),
    ...(material ? [`${material} ${core} for men`] : []),
    ...names.flatMap((word) => [`${word} for men`, `buy ${word} online in pakistan`, `${word} price in pakistan`]),
    `${core} cash on delivery pakistan`,
  ]).slice(0, 14);

  const local = uniq([...cities.flatMap((city) => [`${core} in ${city.toLowerCase()}`]), `${core} shop in ${cities[0]?.toLowerCase() ?? "lahore"}`, `${core} near me`, `men's wear shop ${cities[0]?.toLowerCase() ?? "lahore"}`]).slice(0, 9);

  const occasions = uniq(occasionsFor(`${type} ${name}`).map((occasion) => `${core} ${occasion}`)).slice(0, 6);

  const brand = uniq([`nure asmir ${core}`, `nure asmir ${input.category ?? ""}`.trim(), name, ...colors.map((color) => `nure asmir ${color} ${core}`)]).slice(0, 6);

  return [
    { title: "People ready to buy", why: "Phrases from shoppers who want to order. Use two or three of them naturally in your description.", phrases: buying },
    { title: "Near you (local search)", why: "People searching from a city. These bring walk-in and delivery customers, and match your shop addresses.", phrases: local },
    { title: "Occasions", why: "Shoppers often search by event. Mention the occasions that really suit this product.", phrases: occasions },
    { title: "Your brand", why: "What people type when they already know you. Make sure your shop name sits next to the product name.", phrases: brand },
  ].filter((group) => group.phrases.length);
}

const words = (text: string) => clean(text).split(/\s+/).filter(Boolean).length;

export function seoChecklist(input: SeoInput): CheckItem[] {
  const name = clean(input.name);
  const type = clean(input.type).toLowerCase();
  const description = clean(input.description ?? "");
  const lower = `${name} ${description}`.toLowerCase();
  const totalPhotos = input.photoCounts.reduce((sum, n) => sum + n, 0);
  return [
    { ok: name.length >= 15 && name.length <= 60, label: "The name is clear and not too long", tip: "Aim for 15–60 characters, like “Olive Cotton Cargo Pants for Men”. Google cuts longer names." },
    { ok: Boolean(type) && name.toLowerCase().includes(type.split(" ")[0] ?? ""), label: "The name says what the product is", tip: `Put “${input.type || "Kurta"}” in the name so searchers see it straight away.` },
    { ok: words(description) >= 40, label: "The description has at least 40 words", tip: "Press “Write it for me”, then add one real detail: fit, fabric feel or an occasion. Longer, honest descriptions rank better." },
    { ok: input.colors.some((color) => color && lower.includes(color.toLowerCase())), label: "A colour is mentioned in the text", tip: "People search by colour (“black kurta”). Say the colour in the name or description." },
    { ok: Boolean(input.material) || /cotton|wash|linen|wool|leather|cambric|karandi|khaddar|silk|polyester|denim|twill/i.test(description), label: "The fabric is mentioned", tip: "Fabric is one of the most searched details. Fill “Fabric” or write it in the description." },
    { ok: totalPhotos >= 3, label: "There are 3 or more photos", tip: "Front, back and a close-up of the fabric. Pictures make Google show your product in image results." },
    { ok: input.photoCounts.every((n) => n >= 1), label: "Every colour has its own photo", tip: "Shoppers who choose a colour expect to see that colour." },
    { ok: input.hasPrice, label: "A price is set", tip: "Google only shows price and “In stock” for products that have a price." },
    { ok: Boolean(input.category), label: "A category is chosen", tip: "The category page helps Google understand what your shop sells." },
  ];
}

/** How the page will roughly look as a Google result (Google decides the final wording). */
export function serpPreview(input: { name: string; shortDescription?: string; description?: string; seoTitle?: string | null; seoDescription?: string | null }, brand = "Nure Asmir") {
  const title = clean(input.seoTitle || `${input.name || "Product name"} | ${brand}`).slice(0, 60);
  const body = clean(input.seoDescription || input.shortDescription || input.description || "Add a description so Google has something to show here.");
  const description = body.length > 155 ? `${body.slice(0, 152).trimEnd()}…` : body;
  return { title, description };
}

export const googleSearchUrl = (phrase: string) => `https://www.google.com/search?q=${encodeURIComponent(phrase)}&gl=pk&hl=en`;
