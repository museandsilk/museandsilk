import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — check .env.local`);
  return value;
}

let client: S3Client | null = null;

function r2Client(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

function bucket(): string {
  return requireEnv("R2_BUCKET_NAME");
}

export function newObjectKey(prefix: string, contentType: string): string {
  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  return `${prefix}/${randomUUID()}.${ext}`;
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await r2Client().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObjectBytes(key: string): Promise<{ body: Uint8Array; contentType?: string } | null> {
  try {
    const result = await r2Client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return null;
    return { body: bytes, contentType: result.ContentType };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await r2Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Short-lived signed URL for admin-only access to private objects (payment proofs). Never used for
 * public product/campaign images, which are served through the streaming /api/media route instead. */
export async function getSignedObjectUrl(key: string, expiresInSeconds = 300): Promise<string> {
  return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: expiresInSeconds,
  });
}
