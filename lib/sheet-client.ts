"use client";

// Browser-only Excel helpers. The Excel library (ExcelJS, ~0.9 MB) is NOT part of the website's code bundle:
// it is a plain, versioned file in /public/vendor (cached by the browser permanently) that is fetched only after the
// owner opens the product screens (a quiet prefetch) or presses a button. That keeps the admin fast to open and the server code small.

import { parseCsv, SHEET_COLUMNS } from "./product-sheet";
import { EXCELJS_URL } from "./vendor";

type ExcelJSLike = {
  Workbook: new () => {
    addWorksheet: (name: string, options?: Record<string, unknown>) => WorksheetLike;
    xlsx: { writeBuffer: () => Promise<ArrayBuffer>; load: (data: ArrayBuffer) => Promise<void> };
    worksheets: WorksheetLike[];
  };
};
type CellLike = { value: unknown; font?: Record<string, unknown>; fill?: Record<string, unknown>; alignment?: Record<string, unknown>; dataValidation?: Record<string, unknown>; border?: Record<string, unknown>; numFmt?: string; note?: unknown };
type RowLike = { height?: number; getCell: (index: number) => CellLike; values: unknown[]; eachCell: (cb: (cell: CellLike, col: number) => void) => void; font?: Record<string, unknown>; fill?: Record<string, unknown> };
export type WorksheetLike = {
  columns: Array<{ width?: number }>;
  getRow: (index: number) => RowLike;
  getCell: (ref: string) => CellLike;
  addRow: (values: unknown[]) => RowLike;
  mergeCells: (range: string) => void;
  views: unknown[];
  eachRow: (options: { includeEmpty: boolean }, cb: (row: RowLike, index: number) => void) => void;
  rowCount: number;
  state?: string;
  properties?: Record<string, unknown>;
};

let loading: Promise<ExcelJSLike> | null = null;

export function loadExcel(): Promise<ExcelJSLike> {
  const existing = (window as unknown as { ExcelJS?: ExcelJSLike }).ExcelJS;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise<ExcelJSLike>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = EXCELJS_URL;
    script.async = true;
    script.onload = () => {
      const lib = (window as unknown as { ExcelJS?: ExcelJSLike }).ExcelJS;
      if (lib) resolve(lib);
      else reject(new Error("Excel tools did not start."));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("Could not load the Excel tools. Please check your internet and try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function saveFile(data: ArrayBuffer | Blob | string, filename: string, type: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const GREEN = "FF2B6B5E";

const EXAMPLE_ROWS: unknown[][] = [
  ["Olive Cargo Pants", "Pants", "Cargo Pants", "Olive", "30", 6500, "", 10, "", "Cotton twill", "Relaxed cargo pants with deep pockets. Easy to wear every day.", "Yes", "olive-cargo-1.jpg, olive-cargo-2.jpg", "New"],
  ["Olive Cargo Pants", "Pants", "Cargo Pants", "Olive", "32", 6500, "", 14, "", "", "", "Yes", "", ""],
  ["Olive Cargo Pants", "Pants", "Cargo Pants", "Olive", "34", 6500, 7500, 8, "", "", "", "Yes", "", ""],
  ["Ivory Kameez Shalwar", "Shalwar Kameez", "Kameez Shalwar", "Ivory", "M", 12500, "", 6, "", "Wash & wear", "A clean everyday kameez shalwar in soft wash & wear fabric.", "Yes", "ivory-ks-1.jpg", ""],
  ["Ivory Kameez Shalwar", "Shalwar Kameez", "Kameez Shalwar", "Ivory", "L", 12500, "", 6, "", "", "", "Yes", "", ""],
  ["Tan Leather Wallet", "Accessories", "Wallet", "Tan", "One size", 3500, 4500, 20, "", "Leather", "Slim bifold wallet in genuine leather.", "Yes", "tan-wallet.jpg", "Sale"],
];

const TYPE_SUGGESTIONS = ["Shalwar Kameez", "Kameez Shalwar", "Kurta", "Shirt", "T-Shirt", "Polo Shirt", "Pants", "Cargo Pants", "Jeans", "Waistcoat", "Sweater", "Hoodie", "Wallet", "Belt", "Card Holder", "Cap", "Socks"];

function styleHeader(ws: WorksheetLike, columns = SHEET_COLUMNS.length) {
  const header = ws.getRow(1);
  header.height = 34;
  for (let c = 1; c <= columns; c++) {
    const cell = header.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    cell.alignment = { vertical: "middle", wrapText: true };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

/** The product sheet: instructions, an empty fill-in sheet with dropdowns, a worked example, and the lists. */
export async function downloadProductTemplate(categories: string[]) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();

  // 1. How to fill it
  const guide = wb.addWorksheet("1 - How to fill");
  guide.columns = [{ width: 4 }, { width: 100 }];
  const lines: Array<[string, boolean?]> = [
    ["How to add many products at once", true],
    ["1.  Open the sheet called “2 - Your products”.", false],
    ["2.  Type ONE ROW FOR EACH SIZE. A product with 4 sizes needs 4 rows. Copy the product name, category, type and colour down on every row.", false],
    ["3.  Columns with a * are needed. The others you can leave empty.", false],
    ["4.  Category, Type and Yes/No have a little arrow — click the cell and pick from the list.", false],
    ["5.  Photos: write the picture file names in “Photo file names” (for example olive-cargo-1.jpg). You choose the pictures on the website in the next step. The first name is the main photo.", false],
    ["6.  Look at the sheet “3 - Example” if you are not sure. Then save this file and upload it on the website: Products → Add many with Excel.", false],
    ["", false],
    ["Using Google Sheets? Open this file in Google Sheets (File → Import), fill it in, then File → Download → Microsoft Excel (.xlsx). Upload that file.", false],
    ["Prices are in rupees, numbers only (6500, not Rs. 6,500/-). Do not change the titles in the first row.", false],
  ];
  lines.forEach(([text, bold], index) => {
    const cell = guide.getCell(`B${index + 1}`);
    cell.value = text;
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.font = bold ? { bold: true, size: 16, color: { argb: GREEN } } : { size: 12 };
  });

  // 2. The sheet to fill
  const ws = wb.addWorksheet("2 - Your products");
  ws.columns = SHEET_COLUMNS.map((col) => ({ width: col.width }));
  SHEET_COLUMNS.forEach((col, index) => {
    const cell = ws.getRow(1).getCell(index + 1);
    cell.value = col.label;
    cell.note = col.help;
  });
  styleHeader(ws);

  // 3. Example
  const example = wb.addWorksheet("3 - Example");
  example.columns = SHEET_COLUMNS.map((col) => ({ width: col.width }));
  SHEET_COLUMNS.forEach((col, index) => {
    example.getRow(1).getCell(index + 1).value = col.label;
  });
  styleHeader(example);
  EXAMPLE_ROWS.forEach((row) => example.addRow(row));

  // 4. Lists for the dropdowns
  const lists = wb.addWorksheet("Lists");
  lists.getCell("A1").value = "Categories";
  lists.getCell("B1").value = "Types";
  lists.getCell("C1").value = "Yes/No";
  lists.getCell("D1").value = "Labels";
  const cats = categories.length ? categories : ["Shirts", "Pants", "Shalwar Kameez", "Accessories"];
  cats.forEach((name, i) => (lists.getCell(`A${i + 2}`).value = name));
  TYPE_SUGGESTIONS.forEach((name, i) => (lists.getCell(`B${i + 2}`).value = name));
  ["Yes", "No"].forEach((name, i) => (lists.getCell(`C${i + 2}`).value = name));
  ["", "New", "Sale", "Bestseller", "Limited"].forEach((name, i) => (name ? (lists.getCell(`D${i + 2}`).value = name) : undefined));

  const col = (key: string) => SHEET_COLUMNS.findIndex((c) => c.key === key) + 1;
  const letter = (n: number) => String.fromCharCode(64 + n);
  for (let r = 2; r <= 501; r++) {
    ws.getRow(r).getCell(col("category")).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`Lists!$A$2:$A$${cats.length + 30}`] };
    ws.getRow(r).getCell(col("type")).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`Lists!$B$2:$B$${TYPE_SUGGESTIONS.length + 1}`] };
    ws.getRow(r).getCell(col("show")).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$C$2:$C$3`] };
    ws.getRow(r).getCell(col("label")).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$D$2:$D$5`] };
    ws.getRow(r).getCell(col("price")).dataValidation = { type: "decimal", operator: "greaterThan", formulae: [0], allowBlank: true, showErrorMessage: true, errorTitle: "Price", error: "Please type the price as a number, like 5500." };
    ws.getRow(r).getCell(col("stock")).dataValidation = { type: "whole", operator: "greaterThanOrEqual", formulae: [0], allowBlank: true, showErrorMessage: true, errorTitle: "Stock", error: "Please type how many you have, as a whole number." };
  }
  void letter;

  saveFile(await wb.xlsx.writeBuffer(), "Nure-Asmir-products-sheet.xlsx", XLSX_TYPE);
}

export type StockExportRow = { product: string; size: string; sku: string; price: number; oldPrice: number | null; stock: number };

/** Current prices and stock as a sheet to edit and upload back. */
export async function downloadStockSheet(rows: StockExportRow[]) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Stock and prices");
  const headers = ["Product name (do not change)", "Size (do not change)", "Product code (do not change)", "Price (PKR)", "Old price (optional)", "In stock"];
  ws.columns = [{ width: 38 }, { width: 18 }, { width: 26 }, { width: 14 }, { width: 18 }, { width: 12 }];
  headers.forEach((text, i) => (ws.getRow(1).getCell(i + 1).value = text));
  styleHeader(ws, headers.length);
  rows.forEach((row) => ws.addRow([row.product, row.size, row.sku, row.price, row.oldPrice ?? "", row.stock]));
  for (let r = 2; r <= rows.length + 1; r++) for (let c = 1; c <= 3; c++) ws.getRow(r).getCell(c).font = { color: { argb: "FF777777" } };
  saveFile(await wb.xlsx.writeBuffer(), `Nure-Asmir-stock-${new Date().toISOString().slice(0, 10)}.xlsx`, XLSX_TYPE);
}

function cellText(value: unknown): unknown {
  if (value && typeof value === "object") {
    const v = value as { text?: string; richText?: Array<{ text: string }>; result?: unknown; hyperlink?: string };
    if (v.richText) return v.richText.map((part) => part.text).join("");
    if (v.result !== undefined) return v.result;
    if (v.text !== undefined) return v.text;
    if (value instanceof Date) return value.toISOString();
  }
  return value;
}

/** Reads the first sheet that looks like a product/stock sheet, from an .xlsx or .csv file. */
export async function readSheetFile(file: File): Promise<unknown[][]> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return parseCsv(await file.text());
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Please choose an Excel file (.xlsx) or a .csv file. Old .xls files: open them in Excel and use Save As → Excel Workbook.");
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const wanted = wb.worksheets.find((sheet) => /your products|products|stock/i.test(String((sheet as unknown as { name?: string }).name ?? ""))) ?? wb.worksheets.find((sheet) => (sheet as unknown as { name?: string }).name !== "Lists") ?? wb.worksheets[0];
  const table: unknown[][] = [];
  wanted.eachRow({ includeEmpty: false }, (row, index) => {
    const values = (row.values as unknown[]).slice(1).map(cellText);
    table[index - 1] = values;
  });
  for (let i = 0; i < table.length; i++) table[i] ??= [];
  return table;
}
