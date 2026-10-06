import { getAdminUser } from "@/lib/auth/admin-auth";
import { isOrderTab, listOrders, orderTabCounts } from "@/lib/admin/orders-query";

export const dynamic = "force-dynamic";

/** Paged, searchable order list (the order screen reads the same query directly on the server). */
export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const tabParam = url.searchParams.get("tab") ?? undefined;
  const tab = isOrderTab(tabParam) ? tabParam : "all";
  const [list, counts] = await Promise.all([
    listOrders({ tab, q: url.searchParams.get("q") ?? "", page: Number(url.searchParams.get("page") ?? 1) || 1, pageSize: Math.min(100, Number(url.searchParams.get("pageSize") ?? 25) || 25) }),
    orderTabCounts(),
  ]);
  return Response.json({ orders: list.rows, total: list.total, page: list.page, pageSize: list.pageSize, counts });
}
