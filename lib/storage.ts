import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Neon Object Storage (S3-compatible), declared in neon.ts. Two buckets:
 *   - public  ("nure-asmir-media",   public_read) — product / category / campaign imagery. Read
 *     anonymously by the Cloudflare CDN (see lib/media-url.ts and app/cdn/[...key]/route.ts).
 *   - private ("nure-asmir-private", private)     — customer payment proofs. Only ever read back
 *     through a short-lived presigned URL handed to a signed-in admin.
 * Credentials come from the AWS_* variables `neon env pull` / `neon deploy` write to .env.local.
 */
export type Visibility = "public" | "private";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — run \`neon env pull\` or check .env.local`);
  return value;
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: process.env.AWS_REGION || "ap-southeast-1",
    endpoint: requireEnv("AWS_ENDPOINT_URL_S3"),
    credentials: {
      accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    },
    // Required by the AWS SDK for any custom S3 endpoint (Neon documents this explicitly).
    forcePathStyle: true,
  });
  return client;
}

export function bucketName(visibility: Visibility): string {
  return visibility === "public"
    ? process.env.STORAGE_PUBLIC_BUCKET || "nure-asmir-media"
    : process.env.STORAGE_PRIVATE_BUCKET || "nure-asmir-private";
}

/** Public origin of the media bucket, e.g. https://br-xxx.storage.c-4.ap-southeast-1.aws.neon.tech/nure-asmir-media */
export function publicBucketOrigin(): string {
  return `${requireEnv("AWS_ENDPOINT_URL_S3").replace(/\/$/, "")}/${bucketName("public")}`;
}

export function newObjectKey(prefix: string, contentType: string): string {
  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  return `${prefix}/${randomUUID()}.${ext}`;
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
  visibility: Visibility = "public",
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucketName(visibility),
      Key: key,
      Body: body,
      ContentType: contentType,
      // Keys are random UUIDs and never overwritten in place, so the CDN may cache them forever.
      ...(visibility === "public" ? { CacheControl: "public, max-age=31536000, immutable" } : {}),
    }),
  );
}

export async function getObjectBytes(
  key: string,
  visibility: Visibility = "public",
): Promise<{ body: Uint8Array; contentType?: string } | null> {
  try {
    const result = await s3().send(new GetObjectCommand({ Bucket: bucketName(visibility), Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return null;
    return { body: bytes, contentType: result.ContentType };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string, visibility: Visibility = "public"): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucketName(visibility), Key: key }));
}

/** Short-lived signed URL for admin-only access to private objects (payment proofs). */
export async function getSignedObjectUrl(key: string, expiresInSeconds = 300): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucketName("private"), Key: key }), {
    expiresIn: expiresInSeconds,
  });
}
