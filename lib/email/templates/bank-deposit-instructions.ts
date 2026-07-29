import type { OrderEmailPayload } from "../resend";

export function bankDepositInstructionsEmail(payload: OrderEmailPayload): string {
  const bank = payload.bank;
  return `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1e1b18;">
    <h1 style="font-weight:400;font-size:26px;letter-spacing:-0.02em;">Complete your payment</h1>
    <p style="color:#6f675f;line-height:1.7;">
      To confirm your order, please deposit the total amount of
      <strong>${payload.currency} ${payload.total.toLocaleString()}</strong> into the following account:
    </p>
    <table style="width:100%;font-size:14px;margin:20px 0;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#6f675f;">Bank</td><td style="padding:8px 0;text-align:right;">${bank?.name ?? ""}</td></tr>
      <tr><td style="padding:8px 0;color:#6f675f;">Account Title</td><td style="padding:8px 0;text-align:right;">${bank?.accountTitle ?? ""}</td></tr>
      <tr><td style="padding:8px 0;color:#6f675f;">Account Number</td><td style="padding:8px 0;text-align:right;">${bank?.accountNumber ?? ""}</td></tr>
      <tr><td style="padding:8px 0;color:#6f675f;">IBAN</td><td style="padding:8px 0;text-align:right;">${bank?.iban ?? ""}</td></tr>
    </table>
    <p style="color:#6f675f;line-height:1.7;">
      After completing payment, please send your receipt or screenshot to our WhatsApp number
      ${payload.whatsappNumber ? `<strong>${payload.whatsappNumber}</strong>` : "listed on the order confirmation page"},
      along with your order number <strong>${payload.orderNumber}</strong>.
    </p>
    <p style="color:#6f675f;line-height:1.7;">
      Your order will be confirmed after payment verification and then dispatched to your delivery address.
    </p>
    <p style="margin-top:40px;color:#a99682;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Muse &amp; Silk</p>
  </div>`;
}
