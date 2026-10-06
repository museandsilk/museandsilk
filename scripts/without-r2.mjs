// Writes a copy of a wrangler config with the R2 cache binding removed:
//   node scripts/without-r2.mjs wrangler.jsonc wrangler.deploy.jsonc
// Used by the deploy workflow when R2 is not enabled on the Cloudflare account yet. OpenNext copes with the
// missing binding (pages are simply not cached on the server – they render fresh on each visit) and the next
// deploy after R2 is enabled picks the normal config up again.
import fs from "node:fs";

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error("Usage: node scripts/without-r2.mjs <from> <to>");
  process.exit(1);
}
// wrangler.jsonc allows // comments and trailing commas: strip them (outside strings) before parsing.
const text = fs.readFileSync(from, "utf8");
let out = "";
let inString = false;
for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (inString) {
    out += ch;
    if (ch === "\\") out += text[++i];
    else if (ch === '"') inString = false;
  } else if (ch === '"') {
    inString = true;
    out += ch;
  } else if (ch === "/" && text[i + 1] === "/") {
    while (i < text.length && text[i] !== "\n") i++;
    out += "\n";
  } else out += ch;
}
const config = JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
delete config.r2_buckets;
fs.writeFileSync(to, JSON.stringify(config, null, 2));
console.log(`${to}: R2 binding removed`);
