import { AwsClient } from "aws4fetch";

/**
 * Neon Object Storage (S3-compatible), declared in neon.ts. Two buckets:
 *   - public  ("nure-asmir-media",   public_read) — product / category / campaign imagery. Read
 *     anonymously by the Cloudflare CDN (see lib/media-url.ts and app/cdn/[...key]/route.ts).
 *   - private ("nure-asmir-private", private)     — customer payment proofs. Only ever read back
 *     through a short-lived presigned URL handed to a signed-in admin.
 * Credentials come from the AWS_* variables `neon env pull` / `neon deploy` write to .env.local.
 *
 * Requests are signed with aws4fetch (SigV4 over plain fetch, ~3 KB) rather than the AWS SDK, which
 * would add well over a megabyte to the Cloudflare Worker bundle.
 */
export type Visibility = "public" | "private";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — run \`neon env pull\` or check .env.local`);
  return value;
}

let client: AwsClient | null = null;

function aws(): AwsClient {
  if (client) return client;
  client = new AwsClient({
    accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    region: process.env.AWS_REGION || "ap-southeast-1",
    service: "s3",
  });
  return client;
}

export function bucketName(visibility: Visibility): string {
  return visibility === "public"
    ? process.env.STORAGE_PUBLIC_BUCKET || "nure-asmir-media"
    : process.env.STORAGE_PRIVATE_BUCKET || "nure-asmir-private";
}

function endpoint(): string {
  return requireEnv("AWS_ENDPOINT_URL_S3").replace(/\/$/, "");
}

/** Path-style object URL (Neon requires path-style addressing). */
function objectUrl(key: string, visibility: Visibility): string {
  return `${endpoint()}/${bucketName(visibility)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Public origin of the media bucket, e.g. https://br-xxx.storage.c-4.ap-southeast-1.aws.neon.tech/nure-asmir-media */
export function publicBucketOrigin(): string {
  return `${endpoint()}/${bucketName("public")}`;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

export function newObjectKey(prefix: string, contentType: string): string {
  // Map known types explicitly – never derive the extension from user-controlled header text.
  const ext = EXTENSIONS[contentType.split(";")[0].trim().toLowerCase()] ?? "bin";
  return `${prefix}/${crypto.randomUUID()}.${ext}`;
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
  visibility: Visibility = "public",
): Promise<void> {
  const response = await aws().fetch(objectUrl(key, visibility), {
    method: "PUT",
    body: body as unknown as BodyInit,
    headers: {
      "Content-Type": contentType,
      // Keys are random UUIDs and never overwritten in place, so the CDN may cache them forever.
      ...(visibility === "public" ? { "Cache-Control": "public, max-age=31536000, immutable" } : {}),
    },
  });
  if (!response.ok) throw new Error(`Storage PUT ${key} failed: ${response.status} ${await response.text().catch(() => "")}`);
}

export async function getObjectBytes(
  key: string,
  visibility: Visibility = "public",
): Promise<{ body: Uint8Array; contentType?: string } | null> {
  try {
    const response = await aws().fetch(objectUrl(key, visibility));
    if (!response.ok) return null;
    return { body: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? undefined };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string, visibility: Visibility = "public"): Promise<void> {
  const response = await aws().fetch(objectUrl(key, visibility), { method: "DELETE" });
  // S3 answers 204 whether or not the key existed; anything else is a real failure.
  if (!response.ok && response.status !== 404) throw new Error(`Storage DELETE ${key} failed: ${response.status}`);
}

/** Short-lived signed URL for admin-only access to private objects (payment proofs). */
export async function getSignedObjectUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const url = new URL(objectUrl(key, "private"));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await aws().sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}
