import { getAdminUser } from "@/lib/auth/admin-auth";
import { buildOrderTemplate } from "@/lib/admin-order-template";

export const dynamic = "force-dynamic";

/** Downloads order_place_template.json for the bulk importer (admin only). */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const template = await buildOrderTemplate();
  return new Response(`${JSON.stringify(template, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="order_place_template.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
