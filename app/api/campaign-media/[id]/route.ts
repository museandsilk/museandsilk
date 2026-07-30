import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignSlides } from "@/db/schema";
import { getObjectBytes } from "@/lib/r2";
import { nearestVariantWidth, variantKeyFor } from "@/lib/image-processing";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const requestedWidth = Number(new URL(request.url).searchParams.get("w"));

  const [slide] = await db
    .select({
      r2Key: campaignSlides.r2Key,
      contentType: campaignSlides.contentType,
      variantWidths: campaignSlides.variantWidths,
    })
    .from(campaignSlides)
    .where(and(eq(campaignSlides.id, id), eq(campaignSlides.active, true)))
    .limit(1);
  if (!slide) return new Response("Image not found", { status: 404 });

  if (Number.isFinite(requestedWidth) && requestedWidth > 0 && slide.variantWidths?.length) {
    const width = nearestVariantWidth(requestedWidth, slide.variantWidths);
    const variant = await getObjectBytes(variantKeyFor(slide.r2Key, width));
    if (variant) {
      return new Response(Buffer.from(variant.body), {
        headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
      });
    }
  }

  const object = await getObjectBytes(slide.r2Key);
  if (!object) return new Response("Image not found", { status: 404 });

  return new Response(Buffer.from(object.body), {
    headers: {
      "Content-Type": slide.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
