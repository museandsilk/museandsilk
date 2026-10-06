import { desc, gte } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { statusLabel } from "@/lib/order-rules";

export const dynamic = "force-dynamic";

const cell = (value: unknown) => {
  const text = String(value ?? "");
  // Neutralise spreadsheet formulas typed by shoppers (=, +, -, @) before quoting.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Orders as a spreadsheet file (opens in Excel / Google Sheets). `?days=30` limits the range. */
export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days") ?? 30) || 30));
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.select().from(orders).where(gte(orders.createdAt, since)).orderBy(desc(orders.createdAt)).limit(5000);
  const head = ["Order", "Date", "Customer", "Phone", "City", "Address", "Items total", "Delivery", "Discount", "Total", "Payment", "Paid?", "Status", "TCS tracking"];
  const lines = [head.map(cell).join(",")];
  for (const o of rows) {
    lines.push([o.orderNumber, o.createdAt.toLocaleString("en-PK", { timeZone: "Asia/Karachi" }), o.customerName, o.customerPhone, o.city, o.address, o.subtotal, o.deliveryCharge, o.discount, o.total, o.paymentMethod === "cod" ? "Cash on delivery" : "Bank deposit", o.paymentStatus === "paid" ? "Yes" : "No", statusLabel(o.orderStatus), o.courierTrackingNumber ?? ""].map(cell).join(","));
  }
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="nure-asmir-orders-last-${days}-days.csv"`, "Cache-Control": "private, no-store" },
  });
}
