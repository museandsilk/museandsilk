import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { productImages } from "@/db/schema";
import { getObjectBytes } from "@/lib/r2";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const [image] = await db
    .select({ r2Key: productImages.r2Key, contentType: productImages.contentType })
    .from(productImages)
    .where(and(eq(productImages.id, id), eq(productImages.status, "active")))
    .limit(1);
  if (!image) return new Response("Image not found", { status: 404 });

  const object = await getObjectBytes(image.r2Key);
  if (!object) return new Response("Image not found", { status: 404 });

  return new Response(Buffer.from(object.body), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
