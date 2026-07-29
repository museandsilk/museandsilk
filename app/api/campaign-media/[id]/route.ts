import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignSlides } from "@/db/schema";
import { getObjectBytes } from "@/lib/r2";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const [slide] = await db
    .select({ r2Key: campaignSlides.r2Key, contentType: campaignSlides.contentType })
    .from(campaignSlides)
    .where(and(eq(campaignSlides.id, id), eq(campaignSlides.active, true)))
    .limit(1);
  if (!slide) return new Response("Image not found", { status: 404 });

  const object = await getObjectBytes(slide.r2Key);
  if (!object) return new Response("Image not found", { status: 404 });

  return new Response(Buffer.from(object.body), {
    headers: {
      "Content-Type": slide.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
