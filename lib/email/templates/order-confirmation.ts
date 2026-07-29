import type { OrderEmailPayload } from "../resend";

export function orderConfirmationEmail(payload: OrderEmailPayload): string {
  const rows = payload.items
    .map(
      (item) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5ded3;">${item.productName} — ${item.variantName}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5ded3;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5ded3;text-align:right;">${payload.currency} ${item.lineTotal.toLocaleString()}</td>
      </tr>`,
    )
    .join("");

  return `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1e1b18;">
    <h1 style="font-weight:400;font-size:28px;letter-spacing:-0.02em;">Thank you, ${payload.customerName}.</h1>
    <p style="color:#6f675f;line-height:1.6;">
      Your order has been received. Here is a summary for your records.
    </p>
    <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#a77c45;">
      Order ${payload.orderNumber}
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0;">
      <thead>
        <tr>
          <th style="text-align:left;padding-bottom:10px;border-bottom:1px solid #1e1b18;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">Item</th>
          <th style="text-align:center;padding-bottom:10px;border-bottom:1px solid #1e1b18;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">Qty</th>
          <th style="text-align:right;padding-bottom:10px;border-bottom:1px solid #1e1b18;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:right;font-size:18px;">Total: <strong>${payload.currency} ${payload.total.toLocaleString()}</strong></p>
    <p style="color:#6f675f;line-height:1.6;">
      ${payload.paymentMethod === "cod"
        ? "This is a Cash on Delivery order — we will confirm it with you by phone or WhatsApp shortly before dispatch."
        : "Payment instructions for this bank-deposit order are in a separate email."}
    </p>
    ${payload.whatsappNumber ? `<p style="color:#6f675f;">Questions? Message us on WhatsApp: ${payload.whatsappNumber}</p>` : ""}
    <p style="margin-top:40px;color:#a99682;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Muse &amp; Silk</p>
  </div>`;
}
