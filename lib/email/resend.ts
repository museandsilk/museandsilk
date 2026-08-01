import { Resend } from "resend";
import { orderConfirmationEmail } from "./templates/order-confirmation";
import { bankDepositInstructionsEmail } from "./templates/bank-deposit-instructions";
import { reservationReminderEmail, type ReservationReminderPayload } from "./templates/reservation-reminder";

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
  const resend = client();
  if (!resend || !payload.toEmail) return;
  try {
    await resend.emails.send({
      from: fromAddress(),
      to: payload.toEmail,
      subject: `Order ${payload.orderNumber} confirmed — Muse & Silk`,
      html: orderConfirmationEmail(payload),
    });
    if (payload.paymentMethod === "bank_deposit" && payload.bank) {
      await resend.emails.send({
        from: fromAddress(),
        to: payload.toEmail,
        subject: `Payment instructions for order ${payload.orderNumber}`,
        html: bankDepositInstructionsEmail(payload),
      });
    }
  } catch (error) {
    console.error("Resend email send failed", error);
  }
}

/** "Your order is waiting" nudge for orders still pending_confirmation as their reservation
 * window approaches expiry — see lib/orders.ts's sendReservationReminders. Best-effort, same as
 * sendOrderEmails: never throws, since a reminder failing should never block the cron job. */
export async function sendReservationReminderEmail(payload: ReservationReminderPayload): Promise<void> {
  const resend = client();
  if (!resend || !payload.toEmail) return;
  try {
    await resend.emails.send({
      from: fromAddress(),
      to: payload.toEmail,
      subject: `Your order ${payload.orderNumber} is waiting — Muse & Silk`,
      html: reservationReminderEmail(payload),
    });
  } catch (error) {
    console.error("Resend reminder email send failed", error);
  }
}
