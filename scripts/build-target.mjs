// Builds ONE of the two deployables from this codebase:
//
//   node scripts/build-target.mjs store   → the customer-facing storefront Worker ("nure-asmir")
//   node scripts/build-target.mjs admin   → the owner's admin Worker            ("nure-asmir-admin")
//
// Shoppers never download — or even have deployed next to them — any admin code, and the admin
// panel loads only when its link is opened (separate Worker, separate origin, own cookies/CSP/robots).
// `next dev`, tests and a plain `next build` still see the whole app; the split happens only here:
// the directories the target must not contain are moved aside for the duration of the build and put
// back afterwards (also on failure / Ctrl-C), then OpenNext bundles what is left.
//
// Extra args after the target are passed to `opennextjs-cloudflare` (default: build). Examples:
//   node scripts/build-target.mjs store            # build
//   node scripts/build-target.mjs admin deploy     # build + `wrangler deploy` via OpenNext
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!["store", "admin"].includes(target)) {
  console.error("Usage: node scripts/build-target.mjs <store|admin> [build|deploy|preview]");
  process.exit(1);
}
const command = process.argv[3] || "build";

// Everything the other target owns. Shared pieces (root layout, db, lib, middleware, /api/media* …) stay.
const EXCLUDE = {
  store: ["app/admin", "app/api/admin"],
  admin: [
    "app/(store)",
    "app/cdn",
    "app/robots.ts",
    "app/sitemap.ts",
    "app/api/cart-availability",
    "app/api/catalog",
    "app/api/checkout",
    "app/api/cron",
    "app/api/currency",
    "app/api/feeds",
    "app/api/newsletter",
    "app/api/orders",
    "app/api/push",
    "app/api/whatsapp",
  ],
}[target];

const root = ".build-excluded";
const manifestPath = path.join(root, "manifest.json");
const stash = path.join(root, target);
const moved = [];

/** Moves every stashed path (from this or an interrupted earlier run) back to where it came from. */
function restore() {
  let entries = moved.splice(0).map((rel) => ({ stash, rel }));
  if (fs.existsSync(manifestPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      entries = entries.concat(saved.filter((entry) => !entries.some((e) => e.rel === entry.rel)));
    } catch {
      // unreadable manifest – fall through with what we know
    }
  }
  for (const { stash: dir, rel } of entries.reverse()) {
    const from = path.join(dir, rel);
    if (fs.existsSync(from) && !fs.existsSync(rel)) {
      fs.mkdirSync(path.dirname(rel), { recursive: true });
      fs.renameSync(from, rel);
    }
  }
  fs.rmSync(root, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
}

try {
  if (fs.existsSync(root)) {
    console.error("Found files left over from an interrupted split build — restoring them first.");
    restore();
  }
  for (const rel of EXCLUDE) {
    if (!fs.existsSync(rel)) continue;
    fs.mkdirSync(path.dirname(path.join(stash, rel)), { recursive: true });
    fs.renameSync(rel, path.join(stash, rel));
    moved.push(rel);
    // Written after every move so a crash at any point can be undone by the next run.
    fs.writeFileSync(manifestPath, JSON.stringify(moved.map((r) => ({ stash, rel: r }))));
  }
  console.log(`[${target}] excluded: ${moved.join(", ")}`);
  // Generated route types from a previous dev/other-target run would reference the excluded routes.
  fs.rmSync(".next", { recursive: true, force: true });

  const config = target === "admin" ? "wrangler.admin.jsonc" : "wrangler.jsonc";
  const env = { ...process.env, APP_TARGET: target, NEXT_PUBLIC_APP_TARGET: target };
  const args = ["opennextjs-cloudflare", command, "--config", config];
  const result = spawnSync("npx", args, { stdio: "inherit", env, shell: process.platform === "win32" });
  process.exitCode = result.status ?? 1;
} finally {
  restore();
}
