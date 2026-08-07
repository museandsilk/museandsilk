// Clears the ISR page cache (see open-next.config.ts) after every deploy. Necessary because that
// cache lives in R2, which persists across deployments, while Next.js's static asset filenames are
// content-hashed and unique per build. A page cached under an old build can end up referencing
// asset files (JS/CSS chunks) that no longer exist once a new version is deployed — the browser
// gets a real 404 for a stylesheet/script and the page breaks. Purging on every deploy means every
// visitor always gets a page that was either rendered by the *current* build, or not cached yet
// (and gets rendered fresh, on the current build, right then).
//
// Scoped ONLY to the "incremental-cache/" prefix — deliberately hardcoded, no dynamic prefix input
// of any kind, so this script can never be pointed at product/category/campaign image folders no
// matter how it's invoked. Run in the GitHub Actions deploy workflow, after `wrangler deploy`.
// Usage: node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/purge-isr-cache.ts

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

const PREFIX = "incremental-cache/";

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

async function main() {
  let token: string | undefined;
  let count = 0;
  do {
    const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token }));
    for (const obj of list.Contents ?? []) {
      if (!obj.Key) continue;
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
      count++;
    }
    token = list.NextContinuationToken;
  } while (token);
  console.log(`Purged ${count} stale ISR page-cache entries under "${PREFIX}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
