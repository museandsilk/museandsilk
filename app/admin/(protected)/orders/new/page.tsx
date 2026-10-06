import Link from "next/link";
import { HelpBox } from "../../../_ui/client";
import { PageHeader } from "../../../_ui/ui";
import { NewOrderForm } from "./new-order-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New order" };

export default function NewOrderPage() {
  return (
    <>
      <p style={{ marginBottom: 10 }}>
        <Link href="/admin/orders" className="a-muted">
          ← All orders
        </Link>
      </p>
      <PageHeader title="New order" intro="Use this when a customer orders on WhatsApp, Instagram, Facebook or in person. It works like an order from the website: stock is held and the customer can track it." />
      <HelpBox id="new-order">
        <ol>
          <li>Type the customer&apos;s name, phone number and address.</li>
          <li>Search for the product and press <strong>Add</strong>. Choose the size.</li>
          <li>Choose how they pay, then press <strong>Place order</strong>. The order starts as already confirmed.</li>
        </ol>
      </HelpBox>
      <NewOrderForm />
    </>
  );
}
