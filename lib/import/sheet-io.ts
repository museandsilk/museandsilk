// Reads a product sheet (.xlsx or .csv) into plain rows, and builds the downloadable template —
// BROWSER-SIDE ONLY. The Excel library (exceljs, ~1 MB) is loaded on demand, the first time the admin
// opens "Add many with Excel", so it never touches the deployed Worker or any storefront page.
// Everything that decides what a sheet MEANS lives in lib/import/sheet-import.ts (pure, tested).

import type ExcelJSType from "exceljs";
import { COLUMN_LABEL, parseCsv, parseSheetMatrix, REQUIRED_COLUMNS, type ColumnKey } from "@/lib/import/sheet-import";

type ExcelJS = typeof ExcelJSType;

/** exceljs ships a browser bundle ("bare" = no legacy-browser polyfills, which also keeps it clear of
 * the eval-style code some polyfills use and the site's Content-Security-Policy forbids). */
export async function loadExcelJs(): Promise<ExcelJS> {
  // @ts-expect-error — the browser bundle has no type declarations of its own; it's the same API as "exceljs".
  const mod = (await import("exceljs/dist/exceljs.bare.min.js")) as { default?: ExcelJS } & ExcelJS;
  return (mod.default ?? mod) as ExcelJS;
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

/** One spreadsheet cell as the text the person sees. */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.richText)) return (object.richText as Array<{ text?: string }>).map((part) => part.text ?? "").join("");
    if ("result" in object) return cellToString(object.result);
    if (typeof object.text === "string") return object.text;
    if ("error" in object) return "";
  }
  return "";
}

type WorksheetLike = {
  name: string;
  rowCount: number;
  columnCount: number;
  getRow: (index: number) => { getCell: (column: number) => { value: unknown } };
};

export function worksheetToMatrix(sheet: WorksheetLike): string[][] {
  const columns = Math.min(Math.max(sheet.columnCount, 1), 40);
  const rows = Math.min(sheet.rowCount, 5000);
  const matrix: string[][] = [];
  for (let r = 1; r <= rows; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= columns; c++) cells.push(cellToString(row.getCell(c).value));
    matrix.push(cells);
  }
  return matrix;
}

const SKIP_SHEET = /example|how to|^lists?$|instruction/i;

export type SheetFileResult = { matrix: string[][]; sheetName: string } | { error: string };

/** Reads a File (.xlsx or .csv) and returns the products sheet as rows of text. */
export async function readSheetFile(file: File, excel?: ExcelJS): Promise<SheetFileResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return { matrix: parseCsv(await file.text()), sheetName: file.name };
  }
  if (name.endsWith(".xls")) {
    return { error: 'That is an old ".xls" file. Open it in Excel and choose File → Save As → "Excel Workbook (.xlsx)", then upload that.' };
  }
  if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm")) {
    return { error: "Please choose an Excel file (.xlsx) — or a .csv downloaded from Google Sheets." };
  }
  const ExcelJSLib = excel ?? (await loadExcelJs());
  const workbook = new ExcelJSLib.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return { error: "That file couldn't be opened — it may be damaged or password-protected. Try saving it again from Excel as .xlsx." };
  }

  // Prefer the sheet named like "2 - Your products"; otherwise the first sheet with a heading row.
  const candidates = workbook.worksheets.filter((sheet) => !SKIP_SHEET.test(sheet.name));
  const ordered = [...candidates.filter((sheet) => /product/i.test(sheet.name)), ...candidates.filter((sheet) => !/product/i.test(sheet.name))];
  for (const sheet of ordered) {
    const matrix = worksheetToMatrix(sheet as unknown as WorksheetLike);
    const probe = parseSheetMatrix(matrix);
    // a usable sheet has the heading row (fatal "couldn't find the heading row" means it doesn't)
    if (!probe.fatal.some((message) => /heading row/i.test(message))) return { matrix, sheetName: sheet.name };
  }
  return { error: 'No products sheet was found in that file. It should have a sheet with the headings starting "Product name" (the downloaded sheet calls it "2 - Your products").' };
}

// ---------------------------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------------------------

export type TemplateLists = {
  /** Names of the store's categories (shown in the Category dropdown). */
  categories: string[];
  /** Existing "what is it" labels, as examples. */
  types: string[];
  /** Small labels in use, plus the usual ones. */
  labels: string[];
};

const TEMPLATE_COLUMNS: Array<{ key: ColumnKey; title: string; width: number; note: string }> = [
  { key: "name", title: "Product name*", width: 34, note: "The product's name as customers see it. Repeat it on every row of the same product." },
  { key: "category", title: "Category*", width: 20, note: "Pick from the list. A name that is not in the list is created for you (after you confirm) when you upload." },
  { key: "type", title: "What is it?*", width: 30, note: 'A short description of the item, e.g. "Luxury Silk Scarf" or "Women\'s Camel Winter Long Coat".' },
  { key: "colour", title: "Colour*", width: 14, note: "One row per colour. Two colours of the same product = two rows with the same Product name." },
  { key: "size", title: "Size (optional)", width: 22, note: "Leave empty if there are no sizes. Several sizes: write them with commas — S, M, L. (The store page has no size picker yet — see the instructions.)" },
  { key: "price", title: "Price (PKR)*", width: 14, note: "Numbers only (6500, not Rs. 6,500/-). One number for all sizes, or one per size: 5800, 5800, 6200." },
  { key: "oldPrice", title: "Old price (optional)", width: 18, note: "The crossed-out price. Must be higher than the price. One number, or one per size." },
  { key: "stock", title: "Stock*", width: 10, note: "How many you have. With several sizes this number is for EACH size (3 with S, M, L = 9 in total), or write one per size: 2, 4, 6." },
  { key: "code", title: "Product code (optional)", width: 22, note: "Your own code (SKU). Leave empty and one is made for you. With several sizes the size is added to it." },
  { key: "fabric", title: "Fabric (optional)", width: 16, note: "e.g. Silk, Cotton." },
  { key: "description", title: "Description (optional)", width: 44, note: "The full description on the product page. Fill it on the first row of the product." },
  { key: "shortDescription", title: "Short description (optional)", width: 34, note: "One short line shown on product cards. First row of the product." },
  { key: "material", title: "Material (optional)", width: 18, note: "Product material. First row of the product." },
  { key: "care", title: "Care instructions (optional)", width: 28, note: "e.g. Dry clean only. First row of the product." },
  { key: "show", title: "Show on website? (Yes/No)", width: 16, note: "Yes puts it on the website once its photos are in. Leave empty or No to add it hidden and switch it on later. Products without a photo are always added hidden." },
  { key: "photos", title: "Photo file names (optional)", width: 36, note: "File names of the pictures, separated by commas: scarf-1.jpg, scarf-2.jpg. You choose the pictures in the next step. The first one is the main photo. With several colours, write each colour's pictures on that colour's row." },
  { key: "label", title: "Small label (optional)", width: 16, note: "A little tag on the product, e.g. New or Sale." },
  { key: "featured", title: "Featured on home? (Yes/No, optional)", width: 18, note: "Yes shows it in the featured spots." },
];

export const TEMPLATE_HEADERS = TEMPLATE_COLUMNS.map((column) => column.title);

const HOW_TO: string[] = [
  "How to add many products at once",
  "",
  "1.  Fill in the sheet called “2 - Your products”. Look at “3 - Example” if you are not sure.",
  "2.  ONE ROW FOR EACH COLOUR. Two colours of one product = two rows. Copy the Product name, Category and What is it? onto every row of the product.",
  "3.  Columns with a * are needed. The others you can leave empty.",
  "4.  Sizes: if a product comes in sizes, write them with commas in the Size cell (S, M, L). Price and Stock can be ONE number for all sizes, or one per size (2, 4, 6). Stock is counted for each size.",
  "     Note: the store's product page shows one button per colour and has no size picker yet, so shoppers can't choose a size. You will be asked to confirm before products with sizes are added.",
  "5.  Category: pick from the little arrow in the cell. If you type a name that is not in the list, the website asks you to confirm creating that new category when you upload.",
  "6.  Photos: write the picture file names in “Photo file names” (for example scarf-1.jpg, scarf-2.jpg). You choose the pictures on the website in the next step and they are matched by file name. The first name is the main photo.",
  "7.  Show on website?: Yes puts the product on the website once its photos are in. Empty or No adds it hidden. A product with no photo is always added hidden, so customers never see an empty picture.",
  "8.  Prices are in rupees, numbers only (6500, not Rs. 6,500/-). Do not change the titles in the first row.",
  "9.  Save the file, then upload it: Products → Add many with Excel.",
  "",
  "Using Google Sheets? File → Import this file, fill it in, then File → Download → Microsoft Excel (.xlsx) (or CSV). Upload that file.",
  "",
  "Products that are already in the store (same name) are skipped — they are never changed or duplicated.",
];

/** Builds the template workbook and returns its bytes. */
export async function buildTemplate(lists: TemplateLists, excel?: ExcelJS): Promise<ArrayBuffer> {
  const ExcelJSLib = excel ?? (await loadExcelJs());
  const workbook = new ExcelJSLib.Workbook();
  workbook.creator = "Muse & Silk";

  const header = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF1B1714" } }, alignment: { vertical: "middle" as const, wrapText: true } };

  // ---- 1 - How to fill
  const how = workbook.addWorksheet("1 - How to fill", { views: [{ showGridLines: false }] });
  how.getColumn(2).width = 130;
  HOW_TO.forEach((line, index) => {
    const cell = how.getCell(index + 1, 2);
    cell.value = line;
    cell.alignment = { wrapText: true, vertical: "top" };
    if (index === 0) cell.font = { bold: true, size: 16 };
  });

  // ---- 2 - Your products
  const sheet = workbook.addWorksheet("2 - Your products", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = TEMPLATE_COLUMNS.map((column) => ({ header: column.title, key: column.key, width: column.width }));
  const headerRow = sheet.getRow(1);
  headerRow.height = 34;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = header.font;
    cell.fill = header.fill;
    cell.alignment = header.alignment;
    cell.note = TEMPLATE_COLUMNS[colNumber - 1].note;
  });

  // ---- 3 - Example
  const example = workbook.addWorksheet("3 - Example", { views: [{ state: "frozen", ySplit: 1 }] });
  example.columns = TEMPLATE_COLUMNS.map((column) => ({ header: column.title, key: column.key, width: column.width }));
  example.getRow(1).eachCell((cell) => {
    cell.font = header.font;
    cell.fill = header.fill;
    cell.alignment = header.alignment;
  });
  const exampleCategory = lists.categories[0] ?? "Scarves";
  const exampleRows: Array<Partial<Record<ColumnKey, string | number>>> = [
    {
      name: "Example Silk Scarf", category: exampleCategory, type: "Luxury Silk Scarf", colour: "Midnight Blue", price: 1450, oldPrice: 1800, stock: 5,
      description: "A hand-finished silk scarf with a soft drape.", shortDescription: "Soft, hand-finished silk.", fabric: "Silk", show: "Yes", photos: "example-scarf-1.jpg, example-scarf-2.jpg", label: "New",
    },
    { name: "Example Bandana", category: exampleCategory, type: "Satin Silk Bandana", colour: "Emerald", price: 1060, stock: 3, code: "EX-BND-EMG", show: "Yes", photos: "example-bandana-emerald.jpg" },
    { name: "Example Bandana", category: exampleCategory, type: "Satin Silk Bandana", colour: "Cardinal", price: 1050, stock: 2, code: "EX-BND-CRD", photos: "example-bandana-cardinal.jpg" },
    {
      name: "Example Long Coat", category: lists.categories[1] ?? exampleCategory, type: "Women's Camel Winter Long Coat", colour: "Camel", size: "S, M, L", price: "12500, 12500, 13500", stock: "2, 4, 3",
      description: "A tailored double-breasted long coat.", show: "No", photos: "example-coat-1.jpg, example-coat-2.jpg",
    },
  ];
  exampleRows.forEach((values) => example.addRow(values));

  // ---- Lists (sources for the dropdowns)
  const listSheet = workbook.addWorksheet("Lists");
  listSheet.columns = [
    { header: "Categories", key: "c", width: 28 },
    { header: "What is it? — examples already in your store", key: "t", width: 50 },
    { header: "Yes/No", key: "y", width: 10 },
    { header: "Small labels", key: "l", width: 16 },
  ];
  listSheet.getRow(1).font = { bold: true };
  const rowsNeeded = Math.max(lists.categories.length, lists.types.length, lists.labels.length, 2);
  for (let i = 0; i < rowsNeeded; i++) {
    listSheet.addRow({ c: lists.categories[i] ?? "", t: lists.types[i] ?? "", y: ["Yes", "No"][i] ?? "", l: lists.labels[i] ?? "" });
  }

  // ---- dropdowns on "2 - Your products" (rows 2..501)
  const last = 501;
  const columnOf = (key: ColumnKey) => TEMPLATE_COLUMNS.findIndex((column) => column.key === key) + 1;
  for (let r = 2; r <= last; r++) {
    if (lists.categories.length) {
      sheet.getCell(r, columnOf("category")).dataValidation = {
        type: "list", allowBlank: true, formulae: [`Lists!$A$2:$A$${lists.categories.length + 1}`],
        showErrorMessage: true, errorStyle: "warning", errorTitle: "New category?", error: "This category is not in your store yet. You can keep it — you will be asked to create it when you upload the sheet.",
      };
    }
    for (const key of ["show", "featured"] as ColumnKey[]) {
      sheet.getCell(r, columnOf(key)).dataValidation = { type: "list", allowBlank: true, formulae: ['"Yes,No"'], showErrorMessage: true, errorStyle: "stop", errorTitle: "Yes or No", error: "Please pick Yes or No." };
    }
    if (lists.labels.length) {
      sheet.getCell(r, columnOf("label")).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$D$2:$D$${lists.labels.length + 1}`], showErrorMessage: false };
    }
  }

  // keep REQUIRED_COLUMNS / COLUMN_LABEL in sync with what the template offers (guards against drift)
  for (const key of REQUIRED_COLUMNS) {
    if (!TEMPLATE_COLUMNS.some((column) => column.key === key)) throw new Error(`Template is missing the required column ${COLUMN_LABEL[key]}`);
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export function downloadBytes(filename: string, bytes: ArrayBuffer, mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
