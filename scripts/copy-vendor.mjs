// Copies the browser build of ExcelJS into /public/vendor so the admin can load it on demand (only when the
// owner opens the bulk-upload page). Keeping it out of the app bundle keeps the Worker code small.
import fs from "node:fs";
import path from "node:path";

const source = path.join("node_modules", "exceljs", "dist", "exceljs.bare.min.js");
const target = path.join("public", "vendor", "exceljs.min.js");
if (!fs.existsSync(source)) {
  console.warn("[copy-vendor] exceljs is not installed – skipping (the Excel upload screen will not work).");
  process.exit(0);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log(`[copy-vendor] ${target} (${Math.round(fs.statSync(target).size / 1024)} KB)`);
