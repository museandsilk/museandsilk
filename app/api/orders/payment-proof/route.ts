import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { orders, paymentProofs } from "@/db/schema";
import { newObjectKey, putObject } from "@/lib/r2";
import { validatePaymentProofUpload } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const orderId = String(form.get("orderId") ?? "").trim();

  if (!(file instanceof File) || !orderId) {
    return Response.json({ error: "An order and receipt file are required." }, { status: 400 });
  }

  const [order] = await db
    .select({ id: orders.id, paymentMethod: orders.paymentMethod })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.paymentMethod, "bank_deposit"), ne(orders.orderStatus, "cancelled")))
    .limit(1);
  if (!order) {
    return Response.json({ error: "No matching bank-deposit order was found." }, { status: 404 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validatePaymentProofUpload(file.type, bytes);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const key = newObjectKey(`payment-proofs/${order.id}`, file.type);
  try {
    await putObject(key, bytes, file.type);
    await db.insert(paymentProofs).values({
      orderId: order.id,
      r2Key: key,
      contentType: file.type,
      byteSize: bytes.byteLength,
      status: "pending",
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Failed to store payment proof", error);
    return Response.json({ error: "The receipt could not be stored. Please try again." }, { status: 500 });
  }
}
