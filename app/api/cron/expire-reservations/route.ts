import { expireReservations, sendReservationReminders } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  await sendReservationReminders();
  await expireReservations();
  return Response.json({ ok: true });
}
