export type CheckoutOtpPayload = {
  toEmail: string;
  code: string;
};

export function checkoutOtpEmail(payload: CheckoutOtpPayload): string {
  return `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1e1b18;">
    <h1 style="font-weight:400;font-size:26px;letter-spacing:-0.02em;">Confirm your order</h1>
    <p style="color:#6f675f;line-height:1.6;">Enter this code on the checkout page to confirm your order:</p>
    <p style="font-size:36px;letter-spacing:0.2em;font-weight:600;margin:24px 0;">${payload.code}</p>
    <p style="color:#6f675f;line-height:1.6;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
    <p style="margin-top:40px;color:#a99682;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Muse &amp; Silk</p>
  </div>`;
}
