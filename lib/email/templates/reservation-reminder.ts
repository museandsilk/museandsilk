export type ReservationReminderPayload = {
  toEmail: string;
  orderNumber: string;
  customerName: string;
  total: number;
  currency: string;
  paymentMethod: "cod" | "bank_deposit";
  whatsappNumber?: string;
};

export function reservationReminderEmail(payload: ReservationReminderPayload): string {
  const action =
    payload.paymentMethod === "cod"
      ? "confirm this order with you by phone or WhatsApp"
      : "receive your bank deposit and payment proof";

  return `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1e1b18;">
    <h1 style="font-weight:400;font-size:26px;letter-spacing:-0.02em;">Your order is waiting, ${payload.customerName}.</h1>
    <p style="color:#6f675f;line-height:1.6;">
      We're holding your order <strong>${payload.orderNumber}</strong> (${payload.currency} ${payload.total.toLocaleString()}), but we haven't been able to ${action} yet. The reservation on your items won't hold much longer.
    </p>
    <p style="color:#6f675f;line-height:1.6;">
      ${payload.paymentMethod === "cod"
        ? "If you're still expecting a call or WhatsApp message from us, please keep your phone reachable — or message us directly so we don't lose your reservation."
        : "If you haven't yet made the deposit, please do so soon and reply with your payment proof so we can confirm and dispatch your order."}
    </p>
    ${payload.whatsappNumber ? `<p style="color:#6f675f;">Reach us on WhatsApp any time: ${payload.whatsappNumber}</p>` : ""}
    <p style="margin-top:40px;color:#a99682;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Muse &amp; Silk</p>
  </div>`;
}
