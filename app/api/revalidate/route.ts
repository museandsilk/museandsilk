import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * Called by the admin panel (a separate Worker) right after the owner changes something the shop shows – a
 * price, a photo, a banner – so customers see it within seconds instead of waiting for the page cache to
 * expire. Protected by the same shared secret as the scheduled jobs.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}
