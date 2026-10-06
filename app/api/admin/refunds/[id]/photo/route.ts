import { eq } from "drizzle-orm";
import { db } from "@/db";
import { refundRequests } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { getSignedObjectUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Short-lived link to one of the photos a shopper attached to a refund claim (private bucket). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const index = Number(new URL(request.url).searchParams.get("i") ?? 0);
  const [row] = await db.select({ keys: refundRequests.photoKeys }).from(refundRequests).where(eq(refundRequests.id, id)).limit(1);
  const key = row?.keys?.[index];
  if (!key) return Response.json({ error: "Photo not found." }, { status: 404 });
  return Response.redirect(await getSignedObjectUrl(key, 300), 302);
}
