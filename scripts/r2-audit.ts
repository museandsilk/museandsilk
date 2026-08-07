// One-off audit: list everything in the R2 bucket, compare against every key referenced in the
// database (originals + generated variants), and report/delete anything orphaned.
// Usage: node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/r2-audit.ts [--delete]
//
// IMPORTANT: whenever a new image-bearing table or column is added anywhere in the app (a new
// media field on a model, a new content type entirely), it MUST be added to the `referenced` set
// built below. This script previously missed the `categories` table and campaign slides' mobile
// image fields entirely, which meant a real --delete run wiped currently-in-use category cover
// photos and a campaign slide's mobile crop, believing them orphaned. Ran once without --delete
// first is the only way to catch a gap like that before it deletes anything.
//
// This script audits admin-uploaded IMAGES only. The same R2 bucket also holds Next.js's ISR page
// cache (see open-next.config.ts) under its own "incremental-cache/" prefix — those objects are
// never in any of this app's own tables (Next.js manages them itself), so without this exclusion
// every single one of them would show up as a false-positive "orphan" and get deleted by --delete,
// which would just make every page slow again rather than clean anything up. Any future
// non-image, non-database-tracked prefix added to this bucket must be added here too.

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db, schema } from "../db";
import { variantKeyFor } from "../lib/image-variants";

const NON_IMAGE_PREFIXES = ["incremental-cache/"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const client = new S3Client({
  region: "auto",
  endpoint: requireEnv("R2_ENDPOINT"),
  credentials: {
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  },
});
const bucket = requireEnv("R2_BUCKET_NAME");

async function listAllKeys(): Promise<{ key: string; size: number }[]> {
  const keys: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const result = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const obj of result.Contents ?? []) {
      if (obj.Key) keys.push({ key: obj.Key, size: obj.Size ?? 0 });
    }
    token = result.NextContinuationToken;
  } while (token);
  return keys;
}

async function main() {
  const shouldDelete = process.argv.includes("--delete");

  const [images, slides, categories, proofs] = await Promise.all([
    db.select({ r2Key: schema.productImages.r2Key, variantWidths: schema.productImages.variantWidths }).from(schema.productImages),
    db
      .select({
        r2Key: schema.campaignSlides.r2Key,
        variantWidths: schema.campaignSlides.variantWidths,
        mobileR2Key: schema.campaignSlides.mobileR2Key,
        mobileVariantWidths: schema.campaignSlides.mobileVariantWidths,
      })
      .from(schema.campaignSlides),
    db
      .select({
        imageR2Key: schema.categories.imageR2Key,
        imageVariantWidths: schema.categories.imageVariantWidths,
        heroR2Key: schema.categories.heroR2Key,
        heroVariantWidths: schema.categories.heroVariantWidths,
      })
      .from(schema.categories),
    db.select({ r2Key: schema.paymentProofs.r2Key }).from(schema.paymentProofs),
  ]);

  const referenced = new Set<string>();
  for (const row of images) {
    referenced.add(row.r2Key);
    for (const width of row.variantWidths ?? []) {
      referenced.add(variantKeyFor(row.r2Key, width));
    }
  }
  for (const row of slides) {
    referenced.add(row.r2Key);
    for (const width of row.variantWidths ?? []) {
      referenced.add(variantKeyFor(row.r2Key, width));
    }
    // Campaign slides carry a *second*, independent image (the mobile crop) — easy to miss since
    // it lives in its own r2Key/variantWidths pair rather than alongside the desktop one. Skipping
    // it here was exactly the kind of gap that made this script delete still-referenced objects.
    if (row.mobileR2Key) {
      referenced.add(row.mobileR2Key);
      for (const width of row.mobileVariantWidths ?? []) {
        referenced.add(variantKeyFor(row.mobileR2Key, width));
      }
    }
  }
  for (const row of categories) {
    if (row.imageR2Key) {
      referenced.add(row.imageR2Key);
      for (const width of row.imageVariantWidths ?? []) {
        referenced.add(variantKeyFor(row.imageR2Key, width));
      }
    }
    // Categories carry a *second*, independent image (the wide collection-page hero crop, added
    // after this script was first written) — same class of gap as campaign slides' mobile crop
    // above: missing it here means every current hero photo reads as a false-positive orphan.
    if (row.heroR2Key) {
      referenced.add(row.heroR2Key);
      for (const width of row.heroVariantWidths ?? []) {
        referenced.add(variantKeyFor(row.heroR2Key, width));
      }
    }
  }
  for (const row of proofs) referenced.add(row.r2Key);

  const allObjects = await listAllKeys();
  const excluded = allObjects.filter((obj) => NON_IMAGE_PREFIXES.some((prefix) => obj.key.startsWith(prefix)));
  const actual = allObjects.filter((obj) => !NON_IMAGE_PREFIXES.some((prefix) => obj.key.startsWith(prefix)));
  if (excluded.length) {
    console.log(`Skipping ${excluded.length} non-image objects under: ${NON_IMAGE_PREFIXES.join(", ")}`);
  }

  const orphans = actual.filter((obj) => !referenced.has(obj.key));
  const totalOrphanBytes = orphans.reduce((sum, o) => sum + o.size, 0);

  console.log(`Total objects in R2: ${actual.length}`);
  console.log(`Referenced in DB (incl. variants): ${referenced.size}`);
  console.log(`Orphaned objects: ${orphans.length} (${(totalOrphanBytes / 1024).toFixed(1)} KB)`);
  for (const o of orphans) console.log(`  - ${o.key} (${o.size} bytes)`);

  if (shouldDelete && orphans.length) {
    // A referenced-set built from an incomplete table list (see the note at the top of this file)
    // looks, from here, indistinguishable from a genuinely messy bucket — both report "lots of
    // orphans". A real cleanup after normal usage is rarely more than a handful of leftover
    // objects; a run that wants to delete a large slice of the whole bucket is far more likely a
    // missed table than an actual mess, so it refuses to run unattended and asks for a second flag.
    const orphanShare = orphans.length / actual.length;
    if (actual.length > 5 && orphanShare > 0.3 && !process.argv.includes("--confirm-mass-delete")) {
      console.log(
        `\nRefusing to delete: ${orphans.length}/${actual.length} objects (${(orphanShare * 100).toFixed(0)}%) would be removed.`,
      );
      console.log("That's unusually high for normal cleanup — re-check the `referenced` set above covers every image-bearing table.");
      console.log("If this is genuinely expected, re-run with --delete --confirm-mass-delete.");
      process.exit(1);
    }
    console.log(`\nDeleting ${orphans.length} orphaned objects...`);
    for (const o of orphans) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.key }));
      console.log(`  deleted ${o.key}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
