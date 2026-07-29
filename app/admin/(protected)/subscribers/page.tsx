import { desc } from "drizzle-orm";
import { db } from "@/db";
import { subscribers } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminSubscribersPage() {
  const rows = await db.select().from(subscribers).orderBy(desc(subscribers.createdAt));

  return (
    <section className="admin-main">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Muse &amp; Silk</p>
          <h1>Subscribers</h1>
          <p>Consent-recorded newsletter subscribers collected by the website.</p>
        </div>
      </header>
      <div className="order-desk">
        <div className="admin-table-card">
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Consent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((subscriber) => (
                  <tr key={subscriber.email}>
                    <td>{subscriber.email}</td>
                    <td>{subscriber.firstName || "—"}</td>
                    <td>{subscriber.source}</td>
                    <td>{subscriber.status}</td>
                    <td>{subscriber.consentAt.toLocaleString("en-PK")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="admin-empty">
                <h3>No subscribers yet</h3>
                <p>Newsletter signups will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
