import { desc } from "drizzle-orm";
import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { EmptyState, PageHeader, fullDate } from "../../_ui/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email list" };

export default async function AdminSubscribersPage() {
  const rows = await db.select().from(subscribers).orderBy(desc(subscribers.createdAt)).limit(1000);
  return (
    <>
      <PageHeader title="Email list" intro="People who signed up on your website to hear about new arrivals and offers. They agreed to receive your emails." />
      <div className="a-card">
        {rows.length ? (
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Signed up</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((subscriber) => (
                  <tr key={subscriber.email}>
                    <td>{subscriber.email}</td>
                    <td>{subscriber.firstName || "—"}</td>
                    <td>{fullDate(subscriber.consentAt)}</td>
                    <td>{subscriber.status === "subscribed" ? "Subscribed" : "Unsubscribed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="mail" title="No sign-ups yet">When a customer enters their email in the box at the bottom of your website, it appears here.</EmptyState>
        )}
      </div>
    </>
  );
}
