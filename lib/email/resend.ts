import { Resend } from "resend";
import { orderConfirmationEmail } from "./templates/order-confirmation";
import { bankDepositInstructionsEmail } from "./templates/bank-deposit-instructions";
import { reservationReminderEmail, type ReservationReminderPayload } from "./templates/reservation-reminder";
import { checkoutOtpEmail } from "./templates/checkout-otp";

function client(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function fromAddress(): string {
  const name = process.env.RESEND_FROM_NAME || "Muse & Silk";
  const email = process.env.RESEND_FROM_EMAIL;
  return email ? `${name} <${email}>` : "Muse & Silk <onboarding@resend.dev>";
}

// The Resend SDK does NOT throw on API-level failures (invalid recipient, quota exceeded, bad
// domain, etc.) — send() resolves with { data: null, error: {...} } instead. A bare `await
// resend.emails.send(...)` with only a try/catch around it silently treats every one of those
// failures as a successful send. This helper is what actually surfaces them.
async function send(payload: Parameters<Resend["emails"]["send"]>[0]): Promise<boolean> {
  const resend = client();
  if (!resend) return false;
  try {
    const result = await resend.emails.send(payload);
    if (result.error) {
      console.error("Resend email rejected", result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Resend email send failed", error);
    return false;
  }
}

export type OrderEmailPayload = {
  toEmail: string;
  orderNumber: string;
  customerName: string;
  total: number;
  currency: string;
  items: Array<{ productName: string; variantName: string; quantity: number; lineTotal: number }>;
  paymentMethod: "cod" | "bank_deposit";
  bank?: { name: string; accountTitle: string; accountNumber: string; iban: string };
  whatsappNumber?: string;
};

/** Sends order confirmation (and, for bank-deposit orders, payment instructions) by email.
 * Best-effort only: failures are logged and swallowed so a Resend outage never blocks checkout. */
export async function sendOrderEmails(payload: OrderEmailPayload): Promise<void> {
  if (!payload.toEmail) return;
  await send({
    from: fromAddress(),
    to: payload.toEmail,
    subject: `Order ${payload.orderNumber} confirmed — Muse & Silk`,
    html: orderConfirmationEmail(payload),
  });
  if (payload.paymentMethod === "bank_deposit" && payload.bank) {
    await send({
      from: fromAddress(),
      to: payload.toEmail,
      subject: `Payment instructions for order ${payload.orderNumber}`,
      html: bankDepositInstructionsEmail(payload),
    });
  }
}

/** "Your order is waiting" nudge for orders still pending_confirmation as their reservation
 * window approaches expiry — see lib/orders.ts's sendReservationReminders. Best-effort, same as
 * sendOrderEmails: never throws, since a reminder failing should never block the cron job. */
export async function sendReservationReminderEmail(payload: ReservationReminderPayload): Promise<void> {
  if (!payload.toEmail) return;
  await send({
    from: fromAddress(),
    to: payload.toEmail,
    subject: `Your order ${payload.orderNumber} is waiting — Muse & Silk`,
    html: reservationReminderEmail(payload),
  });
}

/** Sends the checkout verification code. Unlike the other senders here, this one is NOT
 * best-effort: the customer has no other way to get the code, so a delivery failure has to be
 * surfaced to /api/checkout/request-otp as a real error rather than silently swallowed. Returns
 * false if Resend isn't configured, or the send is rejected or fails outright. */
export async function sendCheckoutOtpEmail(toEmail: string, code: string): Promise<boolean> {
  return send({
    from: fromAddress(),
    to: toEmail,
    subject: "Your Muse & Silk verification code",
    html: checkoutOtpEmail({ toEmail, code }),
  });
}
