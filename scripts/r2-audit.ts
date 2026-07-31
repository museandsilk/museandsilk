// One-off audit: list everything in the R2 bucket, compare against every key referenced in the
// database (originals + generated variants), and report/delete anything orphaned.
// Usage: node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/r2-audit.ts [--delete]

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db, schema } from "../db";
import { variantKeyFor } from "../lib/image-variants";

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

  const [images, slides, proofs] = await Promise.all([
    db.select({ r2Key: schema.productImages.r2Key, variantWidths: schema.productImages.variantWidths }).from(schema.productImages),
    db.select({ r2Key: schema.campaignSlides.r2Key, variantWidths: schema.campaignSlides.variantWidths }).from(schema.campaignSlides),
    db.select({ r2Key: schema.paymentProofs.r2Key }).from(schema.paymentProofs),
  ]);

  const referenced = new Set<string>();
  for (const row of [...images, ...slides]) {
    referenced.add(row.r2Key);
    for (const width of row.variantWidths ?? []) {
      referenced.add(variantKeyFor(row.r2Key, width));
    }
  }
  for (const row of proofs) referenced.add(row.r2Key);

  const actual = await listAllKeys();

  const orphans = actual.filter((obj) => !referenced.has(obj.key));
  const totalOrphanBytes = orphans.reduce((sum, o) => sum + o.size, 0);

  console.log(`Total objects in R2: ${actual.length}`);
  console.log(`Referenced in DB (incl. variants): ${referenced.size}`);
  console.log(`Orphaned objects: ${orphans.length} (${(totalOrphanBytes / 1024).toFixed(1)} KB)`);
  for (const o of orphans) console.log(`  - ${o.key} (${o.size} bytes)`);

  if (shouldDelete && orphans.length) {
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
