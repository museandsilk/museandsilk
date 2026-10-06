// Copies the browser build of ExcelJS into /public/vendor under a versioned name (lib/vendor.ts), so the admin loads it
// on demand and the browser can cache it forever. Keeping it out of the app bundle keeps the Worker code small.
import fs from "node:fs";
import path from "node:path";

const pkg = JSON.parse(fs.readFileSync(path.join("node_modules", "exceljs", "package.json"), "utf8"));
const source = path.join("node_modules", "exceljs", "dist", "exceljs.bare.min.js");
const wanted = /EXCELJS_VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join("lib", "vendor.ts"), "utf8"))?.[1];
if (!fs.existsSync(source)) {
  console.warn("[copy-vendor] exceljs is not installed – skipping (the Excel upload screen will not work).");
  process.exit(0);
}
if (wanted && wanted !== pkg.version) console.warn(`[copy-vendor] lib/vendor.ts expects ExcelJS ${wanted} but ${pkg.version} is installed – update EXCELJS_VERSION.`);
const dir = path.join("public", "vendor");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const target = path.join(dir, `exceljs-${wanted ?? pkg.version}.min.js`);
fs.copyFileSync(source, target);
console.log(`[copy-vendor] ${target} (${Math.round(fs.statSync(target).size / 1024)} KB)`);
