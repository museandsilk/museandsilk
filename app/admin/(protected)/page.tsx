import Link from "next/link";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, productVariants, products } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [[productCount], [pendingOrders], [lowStock], [monthRevenue], recentOrders] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(products).where(ne(products.status, "archived")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.orderStatus, "pending_confirmation")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.status, "active"),
          sql`${productVariants.stockQuantity} - ${productVariants.reservedQuantity} <= ${productVariants.lowStockThreshold}`,
        ),
      ),
    db
      .select({ total: sql<number>`coalesce(sum(${orders.total}), 0)` })
      .from(orders)
      .where(and(gte(orders.createdAt, monthStart), ne(orders.orderStatus, "cancelled"))),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        total: orders.total,
        orderStatus: orders.orderStatus,
        paymentStatus: orders.paymentStatus,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(10),
  ]);

  return (
    <section className="admin-main">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Muse &amp; Silk</p>
          <h1>Dashboard</h1>
        </div>
        <div className="admin-top-actions">
          <Link href="/" target="_blank">
            View store ↗
          </Link>
          <Link href="/admin/products">Manage products</Link>
        </div>
      </header>

      <div className="admin-metrics">
        <article>
          <span>Total products</span>
          <strong>{productCount?.count ?? 0}</strong>
          <small>Draft, published or archived</small>
        </article>
        <article>
          <span>Pending orders</span>
          <strong>{pendingOrders?.count ?? 0}</strong>
          <small>Awaiting confirmation</small>
        </article>
        <article>
          <span>Low stock variants</span>
          <strong>{lowStock?.count ?? 0}</strong>
          <small>At or below threshold</small>
        </article>
        <article>
          <span>This month&apos;s revenue</span>
          <strong>PKR {Number(monthRevenue?.total ?? 0).toLocaleString("en-PK")}</strong>
          <small>Excludes cancelled orders</small>
        </article>
      </div>

      <div className="admin-table-card">
        <div className="admin-table-tools">
          <div>
            <h2>Recent orders</h2>
            <span>{recentOrders.length} records</span>
          </div>
          <Link href="/admin/orders">View all orders →</Link>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.orderNumber}</strong>
                    <small>{order.createdAt.toLocaleString("en-PK")}</small>
                  </td>
                  <td>{order.customerName}</td>
                  <td>PKR {order.total.toLocaleString("en-PK")}</td>
                  <td>{order.paymentStatus}</td>
                  <td>
                    <span className={`status-pill status-${order.orderStatus}`}>
                      {order.orderStatus.replaceAll("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!recentOrders.length && (
            <div className="admin-empty">
              <span>◇</span>
              <h3>No orders yet</h3>
              <p>New customer orders will appear here automatically.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
