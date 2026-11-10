// Excel / CSV bulk product import — the pure logic (no browser, no network, no DOM), so it can be
// unit-tested directly. lib/import/sheet-io.ts reads the file into a plain matrix of strings; this
// turns that matrix into a checked plan of products, variants and photos; the admin screen
// (app/admin/(protected)/products/bulk) then creates them through the same endpoints a manual
// "Add product" uses.
//
// Sheet rules (deliberately the same as the sheet other Excel-based stores use, so the habit carries
// over): ONE ROW PER COLOUR; the Size cell may list several sizes separated by commas; Price, Old
// price and Stock are either ONE number (applies to every size) or one number per size; every row of
// a product repeats the product name. Photos are written as file names and matched to the pictures the
// admin picks in the next step — the first photo of a product is its main one.

import { slugify } from "@/lib/slug";

// ---------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------

export type ColumnKey =
  | "name"
  | "category"
  | "type"
  | "colour"
  | "size"
  | "price"
  | "oldPrice"
  | "stock"
  | "code"
  | "fabric"
  | "description"
  | "shortDescription"
  | "material"
  | "care"
  | "show"
  | "photos"
  | "label"
  | "featured";

/** Header text -> column. Headers are compared after dropping "*", anything in brackets and
 * punctuation, so "Price (PKR)*", "price" and "PRICE" all match, and sheets written for other stores
 * (which share most of these headings) still read correctly. */
const ALIASES: Record<ColumnKey, string[]> = {
  name: ["product name", "name", "title", "product"],
  category: ["category"],
  type: ["what is it", "type", "product type"],
  colour: ["colour", "color"],
  size: ["size", "sizes"],
  price: ["price", "price pkr", "selling price"],
  oldPrice: ["old price", "compare at price", "compare at", "was price", "original price"],
  stock: ["stock", "quantity", "qty", "stock quantity"],
  code: ["product code", "sku", "code"],
  fabric: ["fabric"],
  description: ["description", "long description"],
  shortDescription: ["short description", "summary"],
  material: ["material"],
  care: ["care instructions", "care"],
  show: ["show on website", "show on the website", "visible", "published", "show"],
  photos: ["photo file names", "photo file name", "photos", "photo", "images", "image file names"],
  label: ["small label", "badge", "label"],
  featured: ["featured on home", "featured on home page", "featured", "featured on homepage"],
};

/** Columns other stores' sheets have that this store has no equivalent for — recognised so they're
 * reported as "ignored" rather than as a mystery. */
const IGNORED_HEADERS = ["subcategory", "sub subcategory", "level 4", "coming soon", "gender"];

export const REQUIRED_COLUMNS: ColumnKey[] = ["name", "category", "type", "colour", "price", "stock"];

export const COLUMN_LABEL: Record<ColumnKey, string> = {
  name: "Product name",
  category: "Category",
  type: "What is it?",
  colour: "Colour",
  size: "Size",
  price: "Price (PKR)",
  oldPrice: "Old price",
  stock: "Stock",
  code: "Product code",
  fabric: "Fabric",
  description: "Description",
  shortDescription: "Short description",
  material: "Material",
  care: "Care instructions",
  show: "Show on website?",
  photos: "Photo file names",
  label: "Small label",
  featured: "Featured on home?",
};

export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type RawRow = { rowNumber: number; cells: Partial<Record<ColumnKey, string>> };

export type ParsedSheet = {
  /** Fatal problems (missing columns, no header) — nothing can be imported. */
  fatal: string[];
  rows: RawRow[];
  /** Headings found but not used by this store (e.g. "Subcategory"). */
  ignoredColumns: string[];
  /** Headings that matched nothing at all. */
  unknownColumns: string[];
};

/** Turns the sheet's rows (an array of arrays of strings, header included) into rows keyed by column. */
export function parseSheetMatrix(matrix: string[][]): ParsedSheet {
  const fatal: string[] = [];
  const clean = matrix.map((row) => row.map((cell) => (cell ?? "").toString().trim()));

  // The header row is the first one (within the first 15) that has a "product name" heading.
  const headerIndex = clean.slice(0, 15).findIndex((row) => row.some((cell) => ALIASES.name.includes(normalizeHeader(cell))));
  if (headerIndex === -1) {
    return {
      fatal: ['Couldn\'t find the heading row. The first row of your sheet must have the headings, starting with "Product name". Please use the sheet you downloaded and don\'t change its first row.'],
      rows: [],
      ignoredColumns: [],
      unknownColumns: [],
    };
  }

  const columns = new Map<ColumnKey, number>();
  const ignoredColumns: string[] = [];
  const unknownColumns: string[] = [];
  clean[headerIndex].forEach((heading, index) => {
    if (!heading) return;
    const normalized = normalizeHeader(heading);
    const key = (Object.keys(ALIASES) as ColumnKey[]).find((candidate) => ALIASES[candidate].includes(normalized));
    if (key) {
      if (!columns.has(key)) columns.set(key, index); // first one wins if a heading is repeated
    } else if (IGNORED_HEADERS.includes(normalized)) ignoredColumns.push(heading.replace(/\*/g, "").trim());
    else unknownColumns.push(heading.replace(/\*/g, "").trim());
  });

  const missing = REQUIRED_COLUMNS.filter((key) => !columns.has(key));
  if (missing.length) {
    fatal.push(`Your sheet is missing these columns: ${missing.map((key) => COLUMN_LABEL[key]).join(", ")}. Please use the sheet you downloaded and don't delete or rename the first row.`);
  }

  const rows: RawRow[] = [];
  for (let i = headerIndex + 1; i < clean.length; i++) {
    const cells: Partial<Record<ColumnKey, string>> = {};
    let any = false;
    for (const [key, index] of columns) {
      const value = clean[i][index] ?? "";
      if (value) {
        cells[key] = value;
        any = true;
      }
    }
    if (any) rows.push({ rowNumber: i + 1, cells });
  }
  return { fatal, rows, ignoredColumns, unknownColumns };
}

// ---------------------------------------------------------------------------------------------
// CSV (Google Sheets "Download as CSV")
// ---------------------------------------------------------------------------------------------

/** Minimal RFC-4180 reader: quoted fields, doubled quotes, CRLF/LF, BOM, and a comma/semicolon/tab
 * delimiter guessed from the first line. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char in counts) counts[char as keyof typeof counts]++;
  }
  const delimiter = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] ?? ",") as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  inQuotes = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Cell parsing
// ---------------------------------------------------------------------------------------------

/** A list cell ("14.5, 15, 15.5"): split on commas / semicolons / line breaks. */
export function splitList(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Parses a money/number cell that holds ONE number or a list of them. Handles "5800", "5,800" (thousands
 * separator), "Rs. 5800", "5800/-" and "5800, 5800, 6200". Returns whole numbers or an error. */
export function parseNumberList(text: string | undefined): { values: number[]; error?: string } {
  if (!text) return { values: [] };
  const trimmed = text.trim();
  // "5,800" / "1,250,000" on its own is a single number with thousands separators, not a list.
  const parts = /^[^\d]*\d{1,3}(,\d{3})+(\.\d+)?[^\d]*$/.test(trimmed) && !/,\s/.test(trimmed) ? [trimmed] : trimmed.split(/\s*[;\n]\s*|,(?=\s)|,(?!\d{3}(?:\D|$))/);
  const values: number[] = [];
  for (const rawPart of parts) {
    const part = rawPart
      .trim()
      .replace(/^(?:rs\.?|pkr|₨)\s*/i, "")
      .replace(/\s*\/-$/, "")
      .replace(/,/g, "");
    if (!part) continue;
    if (!/^\d+(\.\d+)?$/.test(part)) return { values: [], error: `"${rawPart.trim()}" isn't a number — use numbers only (6500, not Rs. 6,500/-)` };
    const value = Number(part);
    if (!Number.isInteger(value)) {
      if (Math.abs(value - Math.round(value)) > 1e-9) return { values: [], error: `"${part}" has decimals — use whole numbers` };
    }
    values.push(Math.round(value));
  }
  return { values };
}

export function parseYesNo(text: string | undefined): boolean | null | "invalid" {
  if (!text) return null;
  const value = text.trim().toLowerCase();
  if (["yes", "y", "true", "1", "show", "on", "published", "live"].includes(value)) return true;
  if (["no", "n", "false", "0", "hide", "hidden", "off", "draft"].includes(value)) return false;
  return "invalid";
}

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------

export type CategoryRef = { id: string; name: string; slug: string; status: string };

export type PlanContext = {
  categories: CategoryRef[];
  existingSlugs: Iterable<string>;
  existingSkus: Iterable<string>;
  /** File names of the pictures the admin picked (empty until the photo step). */
  files: string[];
  /** Whether products with several sizes of one colour may be imported (see PlannedProduct.sizesNeedApproval). */
  allowSizes: boolean;
  /** Import everything as hidden, whatever the sheet says. */
  forceDraft: boolean;
};

export type PlannedVariant = {
  /** Display name: the product name for a single-variant product, else "Colour / Size". */
  name: string;
  sku: string;
  /** True when the sheet gave no code and this SKU was generated. */
  skuGenerated: boolean;
  colour: string;
  size?: string;
  fabric?: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  isDefault: boolean;
  rowNumber: number;
};

export type PhotoJob = {
  /** The name written in the sheet. */
  wanted: string;
  /** The real file it matched (same file name, as picked by the admin). */
  file: string;
  colour: string;
  /** Index into PlannedProduct.variants this photo is attached to; null = a general product photo. */
  variantIndex: number | null;
  sortOrder: number;
  isPrimary: boolean;
  alt: string;
};

export type PlannedProduct = {
  key: string;
  name: string;
  slug: string;
  rowNumbers: number[];
  category?: CategoryRef;
  categoryName: string;
  typeLabel: string;
  description?: string;
  shortDescription?: string;
  material?: string;
  careInstructions?: string;
  badge?: string;
  featured: boolean;
  primaryColour: string;
  /** What the sheet asked for. */
  wantsPublished: boolean;
  /** What will actually happen: "published" only if asked, not forced to draft, and it has a photo. */
  finalStatus: "published" | "draft";
  /** Why a "Yes" is being imported hidden instead (shown to the admin). */
  draftReason?: string;
  variants: PlannedVariant[];
  photos: PhotoJob[];
  missingPhotos: string[];
  requestedPhotoCount: number;
  /** Several sizes of the same colour: the store page has no size picker, so shoppers can't choose. */
  sizesNeedApproval: boolean;
  /** Already in the store (same web address) — skipped, never overwritten. */
  alreadyExists: boolean;
  errors: string[];
  warnings: string[];
};

export type ImportPlan = {
  products: PlannedProduct[];
  /** Problems not tied to one product (bad rows). */
  rowProblems: { rowNumber: number; message: string }[];
  /** Picked files no product refers to. */
  unusedFiles: string[];
};

const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const SKU_STOP_WORDS = new Set(["the", "a", "an", "of", "and", "for"]);

/** A short, unpadded piece of a product code ("Dark Green" -> "DARKGREE"). */
function codePart(value: string, max = 8): string {
  return (value.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase() || "V").slice(0, max);
}

function abbreviate(value: string, length: number, dropStopWords = false): string {
  const words = value
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !(dropStopWords && SKU_STOP_WORDS.has(word.toLowerCase())));
  return (words.join("").toUpperCase() || "X").slice(0, length).padEnd(length, "X");
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function findCategory(wanted: string, categories: CategoryRef[]): { category?: CategoryRef; suggestion?: string } {
  const key = norm(wanted);
  const exact = categories.find((category) => norm(category.name) === key || category.slug === slugify(wanted));
  if (exact) return { category: exact };
  const close = categories
    .map((category) => ({ category, distance: levenshtein(key, norm(category.name)) }))
    .sort((a, b) => a.distance - b.distance)[0];
  const startsWith = categories.find((category) => norm(category.name).startsWith(key) || key.startsWith(norm(category.name)));
  const suggestion = startsWith ?? (close && close.distance <= 3 ? close.category : undefined);
  return { suggestion: suggestion?.name };
}

/** Category names used in the sheet that don't exist in the store yet (one entry per distinct name), so the
 * admin can be asked once whether to create them. `suggestion` is a similar existing category (a likely typo). */
export function missingCategories(rows: RawRow[], categories: CategoryRef[]): { name: string; suggestion?: string; rows: number }[] {
  const found = new Map<string, { name: string; suggestion?: string; rows: number }>();
  for (const row of rows) {
    const name = (row.cells.category ?? "").trim();
    if (!name) continue;
    const result = findCategory(name, categories);
    if (result.category) continue;
    const key = slugify(name);
    if (!key) continue;
    const entry = found.get(key);
    if (entry) entry.rows++;
    else found.set(key, { name, suggestion: result.suggestion, rows: 1 });
  }
  return [...found.values()];
}

function baseName(file: string): string {
  const last = file.split(/[\\/]/).pop() ?? file;
  return last.trim();
}
const stripExt = (file: string) => file.replace(/\.[^.]+$/, "");

type FileIndex = { exact: Map<string, string>; byBase: Map<string, string[]> };
function indexFiles(files: string[]): FileIndex {
  const exact = new Map<string, string>();
  const byBase = new Map<string, string[]>();
  for (const file of files) {
    const name = baseName(file);
    exact.set(name.toLowerCase(), name);
    const base = stripExt(name).toLowerCase();
    byBase.set(base, [...(byBase.get(base) ?? []), name]);
  }
  return { exact, byBase };
}

/** Case-insensitive exact name first; failing that the same name with a different extension
 * (photo.jpg in the sheet, photo.JPEG on disk) when only one file has that name. */
function matchFile(wanted: string, index: FileIndex): string | null {
  const name = baseName(wanted);
  const exact = index.exact.get(name.toLowerCase());
  if (exact) return exact;
  const candidates = index.byBase.get(stripExt(name).toLowerCase());
  return candidates && candidates.length === 1 ? candidates[0] : null;
}

/** The sheet's photo cell: the names are separated by commas, but a file name that itself contains a
 * comma is honoured when the whole cell is exactly one picked file. */
function photoNames(cell: string | undefined, index: FileIndex): string[] {
  if (!cell) return [];
  if (matchFile(cell, index)) return [cell.trim()];
  return splitList(cell).map((name) => name.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
}

type RowVariants = { colour: string; sizes: (string | undefined)[]; prices: number[]; oldPrices: number[]; stocks: number[]; fabric?: string; code?: string; rowNumber: number };

export function planProducts(rows: RawRow[], ctx: PlanContext): ImportPlan {
  const existingSlugs = new Set([...ctx.existingSlugs].map((slug) => slug.toLowerCase()));
  const usedSkus = new Set([...ctx.existingSkus].map((sku) => sku.toUpperCase()));
  const fileIndex = indexFiles(ctx.files);
  const rowProblems: ImportPlan["rowProblems"] = [];

  // 1. group rows by product name, keeping the sheet's order
  const groups = new Map<string, RawRow[]>();
  for (const row of rows) {
    const name = row.cells.name;
    if (!name) {
      rowProblems.push({ rowNumber: row.rowNumber, message: "No product name on this row — every row must repeat the product name." });
      continue;
    }
    const key = norm(name);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const products: PlannedProduct[] = [];
  const claimedSlugs = new Map<string, string>(); // slug -> product name, within this sheet
  const usedPhotoNames = new Set<string>();

  for (const [key, group] of groups) {
    const first = group[0];
    const errors: string[] = [];
    const warnings: string[] = [];
    const name = first.cells.name as string;
    const slug = slugify(name);

    // ---- product-level fields come from the first row; later rows that disagree get a warning
    const pick = (column: ColumnKey) => first.cells[column];
    for (const column of ["category", "type", "description", "shortDescription", "material", "care", "label", "show", "featured"] as ColumnKey[]) {
      const base = pick(column);
      for (const row of group.slice(1)) {
        const value = row.cells[column];
        if (value && base && norm(value) !== norm(base)) {
          warnings.push(`Row ${row.rowNumber}: "${COLUMN_LABEL[column]}" differs from this product's first row (row ${first.rowNumber}) — the first row is used.`);
          break;
        }
        if (value && !base) warnings.push(`Row ${row.rowNumber}: "${COLUMN_LABEL[column]}" is filled here but not on the product's first row (row ${first.rowNumber}) — it was ignored. Put it on the first row.`);
      }
    }

    // ---- category / type
    const categoryName = pick("category") ?? "";
    let category: CategoryRef | undefined;
    if (!categoryName) errors.push("Category is missing.");
    else {
      const found = findCategory(categoryName, ctx.categories);
      category = found.category;
      if (!category) {
        errors.push(
          `Category "${categoryName}" doesn't exist${found.suggestion ? ` — did you mean "${found.suggestion}"?` : ""} (your categories: ${ctx.categories.map((c) => c.name).join(", ") || "none yet"}). Create it first under Categories.`,
        );
      } else if (category.status !== "active") {
        warnings.push(`The category "${category.name}" is switched off, so this product won't appear in the shop until it's switched on.`);
      }
    }
    const typeLabel = pick("type") ?? "";
    if (!typeLabel) errors.push('"What is it?" is missing (for example "Luxury Silk Scarf").');

    // ---- variants: expand every row (a row may list several sizes)
    const rowVariants: RowVariants[] = [];
    for (const row of group) {
      const colour = row.cells.colour ?? "";
      if (!colour) {
        errors.push(`Row ${row.rowNumber}: Colour is missing.`);
        continue;
      }
      const sizeTexts = splitList(row.cells.size);
      const sizes: (string | undefined)[] = sizeTexts.length ? sizeTexts : [undefined];
      const seen = new Set<string>();
      for (const size of sizeTexts) {
        if (seen.has(size.toLowerCase())) warnings.push(`Row ${row.rowNumber}: size "${size}" is listed twice — counted once.`);
        seen.add(size.toLowerCase());
      }
      const uniqueSizes = sizes.filter((size, index) => size === undefined || sizes.findIndex((other) => other?.toLowerCase() === size.toLowerCase()) === index);

      const price = parseNumberList(row.cells.price);
      const oldPrice = parseNumberList(row.cells.oldPrice);
      const stock = parseNumberList(row.cells.stock);
      let bad = false;
      for (const [label, parsed, text] of [["Price", price, row.cells.price], ["Old price", oldPrice, row.cells.oldPrice], ["Stock", stock, row.cells.stock]] as const) {
        if (parsed.error) {
          errors.push(`Row ${row.rowNumber}: ${label} — ${parsed.error}.`);
          bad = true;
        } else if (label !== "Old price" && !text) {
          errors.push(`Row ${row.rowNumber}: ${label} is missing.`);
          bad = true;
        } else if (parsed.values.length > 1 && parsed.values.length !== uniqueSizes.length) {
          errors.push(
            `Row ${row.rowNumber}: ${label} has ${parsed.values.length} numbers but ${uniqueSizes.length === 1 && uniqueSizes[0] === undefined ? "no sizes are listed" : `${uniqueSizes.length} size${uniqueSizes.length === 1 ? " is" : "s are"} listed`} — use one number for all sizes, or exactly one per size.`,
          );
          bad = true;
        }
      }
      if (bad) continue;
      rowVariants.push({ colour, sizes: uniqueSizes, prices: price.values, oldPrices: oldPrice.values, stocks: stock.values, fabric: row.cells.fabric, code: row.cells.code, rowNumber: row.rowNumber });
    }

    // expand into concrete variants
    type Draft = { colour: string; size?: string; fabric?: string; code?: string; price: number; oldPrice?: number; stock: number; rowNumber: number };
    const drafts: Draft[] = [];
    for (const rv of rowVariants) {
      rv.sizes.forEach((size, index) => {
        const pickValue = (values: number[]) => (values.length === 0 ? undefined : values.length === 1 ? values[0] : values[index]);
        drafts.push({ colour: rv.colour, size, fabric: rv.fabric, code: rv.code, price: pickValue(rv.prices) as number, oldPrice: pickValue(rv.oldPrices), stock: pickValue(rv.stocks) as number, rowNumber: rv.rowNumber });
      });
    }
    const identity = new Set<string>();
    const uniqueDrafts: Draft[] = [];
    for (const draft of drafts) {
      const id = `${norm(draft.colour)}|${norm(draft.size ?? "")}`;
      if (identity.has(id)) {
        errors.push(`Row ${draft.rowNumber}: ${draft.colour}${draft.size ? ` / ${draft.size}` : ""} appears twice for this product.`);
        continue;
      }
      identity.add(id);
      uniqueDrafts.push(draft);
    }
    if (!uniqueDrafts.length && !errors.length) errors.push("This product has no usable rows.");
    if (uniqueDrafts.length > 60) errors.push("A product can have at most 60 sizes/colours.");

    // ---- SKUs (reserved only if the product turns out clean, so a broken product doesn't eat codes)
    const multi = uniqueDrafts.length > 1;
    const distinctColours = new Set(uniqueDrafts.map((draft) => norm(draft.colour)));
    const claimedHere = new Set<string>();
    const skuFor = (draft: Draft): { sku: string; generated: boolean } => {
      const suffixParts = [draft.size, distinctColours.size > 1 || !draft.size ? draft.colour : undefined].filter(Boolean) as string[];
      const suffix = suffixParts.map((part) => codePart(part)).join("-");
      if (draft.code) {
        const code = draft.code.trim();
        // a code shared by several variants of one product (sizes) gets the size/colour appended
        const sharing = uniqueDrafts.filter((other) => other.code && norm(other.code) === norm(code)).length > 1;
        return { sku: sharing ? `${code}-${suffix || "V"}` : code, generated: false };
      }
      const base = `MS-${abbreviate(category?.name ?? "GEN", 3)}-${abbreviate(name, 3, true)}-${abbreviate(draft.colour, 3)}`;
      return { sku: multi && draft.size ? `${base}-${codePart(draft.size)}` : base, generated: true };
    };
    const variants: PlannedVariant[] = uniqueDrafts.map((draft, index) => {
      const planned = skuFor(draft);
      let sku = planned.sku;
      if (planned.generated) {
        // generated codes dodge clashes with existing / other products by adding a number
        let attempt = 1;
        while (usedSkus.has(sku.toUpperCase()) || claimedHere.has(sku.toUpperCase())) sku = `${planned.sku}-${++attempt}`;
      } else if (usedSkus.has(sku.toUpperCase())) {
        errors.push(`Row ${draft.rowNumber}: product code "${sku}" is already used by another product.`);
      } else if (claimedHere.has(sku.toUpperCase())) {
        errors.push(`Row ${draft.rowNumber}: product code "${sku}" is used twice in this product.`);
      }
      claimedHere.add(sku.toUpperCase());
      const sizePart = draft.size ? ` / ${draft.size}` : "";
      if (draft.oldPrice !== undefined && draft.oldPrice <= draft.price) {
        warnings.push(`Row ${draft.rowNumber}: old price (${draft.oldPrice}) is not higher than the price (${draft.price}) — it was ignored.`);
      }
      return {
        name: multi ? `${draft.colour}${sizePart}` : name,
        sku,
        skuGenerated: planned.generated,
        colour: draft.colour,
        size: draft.size,
        fabric: draft.fabric || undefined,
        price: draft.price,
        compareAtPrice: draft.oldPrice !== undefined && draft.oldPrice > draft.price ? draft.oldPrice : undefined,
        stock: draft.stock,
        isDefault: index === 0,
        rowNumber: draft.rowNumber,
      };
    });

    // ---- photos: per colour, in the order written; one colour = general product photos, several = per colour
    const wantedByColour = new Map<string, string[]>();
    for (const row of group) {
      const colour = row.cells.colour;
      if (!colour) continue;
      const list = wantedByColour.get(norm(colour)) ?? [];
      for (const wanted of photoNames(row.cells.photos, fileIndex)) {
        if (!list.some((existing) => existing.toLowerCase() === wanted.toLowerCase())) list.push(wanted);
      }
      wantedByColour.set(norm(colour), list);
    }
    const colourDisplay = new Map(variants.map((variant) => [norm(variant.colour), variant.colour]));
    const photos: PhotoJob[] = [];
    const missingPhotos: string[] = [];
    let requestedPhotoCount = 0;
    let order = 0;
    for (const [colourKey, wantedList] of wantedByColour) {
      const colourName = colourDisplay.get(colourKey) ?? colourKey;
      const firstVariantIndex = variants.findIndex((variant) => norm(variant.colour) === colourKey);
      wantedList.forEach((wanted, indexInColour) => {
        requestedPhotoCount++;
        const file = ctx.files.length ? matchFile(wanted, fileIndex) : null;
        if (!file) {
          missingPhotos.push(wanted);
          return;
        }
        usedPhotoNames.add(file.toLowerCase());
        photos.push({
          wanted,
          file,
          colour: colourName,
          variantIndex: distinctColours.size > 1 && firstVariantIndex >= 0 ? firstVariantIndex : null,
          sortOrder: order++,
          isPrimary: photos.length === 0,
          alt: `${name} — ${colourName}${indexInColour > 0 ? `, view ${indexInColour + 1}` : ""}`,
        });
      });
    }

    // ---- publish rules
    const showText = pick("show");
    const show = parseYesNo(showText);
    if (show === "invalid") warnings.push(`"Show on website?" says "${showText}" — it must be Yes or No; this product is added hidden.`);
    const featuredValue = parseYesNo(pick("featured"));
    const wantsPublished = show === true;
    let finalStatus: "published" | "draft" = wantsPublished ? "published" : "draft";
    let draftReason: string | undefined;
    if (wantsPublished && ctx.forceDraft) {
      finalStatus = "draft";
      draftReason = "you chose to add everything hidden";
    } else if (wantsPublished && photos.length === 0) {
      // A product with no picture is never put on the website — customers should never see an empty
      // photo box. (This also covers skipping the photo step: nothing chosen means nothing found.)
      finalStatus = "draft";
      draftReason =
        requestedPhotoCount === 0
          ? "no photo is listed in the sheet, and customers should never see an empty picture"
          : ctx.files.length === 0
            ? "no pictures were chosen, and customers should never see an empty picture"
            : "none of its pictures were found, and customers should never see an empty picture";
    }

    // ---- uniqueness of the web address
    const alreadyExists = existingSlugs.has(slug.toLowerCase());
    if (!slug) errors.push("The product name has no letters or numbers.");
    const claimedBy = claimedSlugs.get(slug);
    if (claimedBy && !alreadyExists) errors.push(`"${name}" and "${claimedBy}" would get the same web address (${slug}) — rename one.`);
    else claimedSlugs.set(slug, name);

    const sizesNeedApproval = variants.some((variant, index) => variant.size && variants.findIndex((other) => norm(other.colour) === norm(variant.colour) && other.size) !== index);
    if (!alreadyExists && !errors.length) for (const variant of variants) usedSkus.add(variant.sku.toUpperCase());

    products.push({
      key,
      name,
      slug,
      rowNumbers: group.map((row) => row.rowNumber),
      category,
      categoryName,
      typeLabel,
      description: pick("description"),
      shortDescription: pick("shortDescription"),
      material: pick("material"),
      careInstructions: pick("care"),
      badge: pick("label"),
      featured: featuredValue === true,
      primaryColour: variants[0]?.colour ?? first.cells.colour ?? "",
      wantsPublished,
      finalStatus,
      draftReason,
      variants,
      photos,
      missingPhotos,
      requestedPhotoCount,
      sizesNeedApproval,
      alreadyExists,
      errors,
      warnings,
    });
  }

  const unusedFiles = ctx.files.map(baseName).filter((file, index, all) => all.indexOf(file) === index && !usedPhotoNames.has(file.toLowerCase()));
  return { products, rowProblems, unusedFiles };
}

/** Whether a planned product will actually be created. */
export function isImportable(product: PlannedProduct, allowSizes: boolean): boolean {
  return !product.errors.length && !product.alreadyExists && (allowSizes || !product.sizesNeedApproval);
}

export function totalStock(product: PlannedProduct): number {
  return product.variants.reduce((sum, variant) => sum + variant.stock, 0);
}
