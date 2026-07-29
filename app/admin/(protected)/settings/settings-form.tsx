"use client";

import { FormEvent, useEffect, useState } from "react";

type Settings = {
  brandName: string;
  whatsappNumber: string;
  supportPhone: string;
  supportEmail: string;
  instagramUrl: string;
  bankName: string;
  bankAccountTitle: string;
  bankAccountNumber: string;
  bankIban: string;
  metaPixelId: string;
  gaMeasurementId: string;
  freeDeliveryThreshold: number;
  codReservationHours: number;
  bankReservationHours: number;
  taxEnabled: boolean;
};

export function SettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const response = await fetch("/api/admin/settings", { cache: "no-store" });
      if (response.ok) setSettings((await response.json()).settings);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = {
      brandName: form.get("brandName"),
      whatsappNumber: form.get("whatsappNumber"),
      supportPhone: form.get("supportPhone"),
      supportEmail: form.get("supportEmail"),
      instagramUrl: form.get("instagramUrl"),
      bankName: form.get("bankName"),
      bankAccountTitle: form.get("bankAccountTitle"),
      bankAccountNumber: form.get("bankAccountNumber"),
      bankIban: form.get("bankIban"),
      metaPixelId: form.get("metaPixelId"),
      gaMeasurementId: form.get("gaMeasurementId"),
      freeDeliveryThreshold: form.get("freeDeliveryThreshold"),
      codReservationHours: form.get("codReservationHours"),
      bankReservationHours: form.get("bankReservationHours"),
      taxEnabled: form.get("taxEnabled") === "on",
    };
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setMessage(response.ok ? "Store settings saved." : result.error ?? "Settings could not be saved.");
    if (response.ok) setSettings(result.settings);
    setBusy(false);
  }

  return (
    <section className="admin-main">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Muse &amp; Silk</p>
          <h1>Store settings</h1>
        </div>
      </header>
      {message && (
        <div className="admin-message" role="status">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}
      {settings && (
        <form className="admin-settings-card" onSubmit={save}>
          <div>
            <p className="eyebrow">Store identity &amp; customer assistance</p>
            <h2>Your changeable contact details</h2>
            <p>
              These values are stored centrally so the public website, checkout and order messages can use the same current
              information.
            </p>
          </div>
          <div className="admin-form-grid">
            <label>
              <span>Brand name</span>
              <input name="brandName" defaultValue={settings.brandName} />
            </label>
            <label>
              <span>WhatsApp Business number</span>
              <input name="whatsappNumber" defaultValue={settings.whatsappNumber} placeholder="+923001234567" />
              <small>Used everywhere on the storefront for WhatsApp ordering links.</small>
            </label>
            <label>
              <span>Support phone</span>
              <input name="supportPhone" defaultValue={settings.supportPhone} placeholder="+923001234567" />
            </label>
            <label>
              <span>Support email</span>
              <input type="email" name="supportEmail" defaultValue={settings.supportEmail} placeholder="care@yourdomain.com" />
            </label>
            <label>
              <span>Instagram profile</span>
              <input type="url" name="instagramUrl" defaultValue={settings.instagramUrl} placeholder="https://instagram.com/..." />
            </label>
            <label>
              <span>Free delivery threshold (PKR)</span>
              <input type="number" min="0" name="freeDeliveryThreshold" defaultValue={settings.freeDeliveryThreshold} />
            </label>
            <label>
              <span>Bank name</span>
              <input name="bankName" defaultValue={settings.bankName} />
            </label>
            <label>
              <span>Bank account title</span>
              <input name="bankAccountTitle" defaultValue={settings.bankAccountTitle} />
            </label>
            <label>
              <span>Bank account number</span>
              <input name="bankAccountNumber" defaultValue={settings.bankAccountNumber} />
            </label>
            <label>
              <span>IBAN</span>
              <input name="bankIban" defaultValue={settings.bankIban} />
            </label>
            <label>
              <span>Meta Pixel ID</span>
              <input name="metaPixelId" defaultValue={settings.metaPixelId} placeholder="123456789012345" />
            </label>
            <label>
              <span>Google Analytics Measurement ID</span>
              <input name="gaMeasurementId" defaultValue={settings.gaMeasurementId} placeholder="G-XXXXXXXXXX" />
            </label>
            <label>
              <span>COD reservation hours</span>
              <input type="number" min="1" name="codReservationHours" defaultValue={settings.codReservationHours} />
            </label>
            <label>
              <span>Bank deposit reservation hours</span>
              <input type="number" min="1" name="bankReservationHours" defaultValue={settings.bankReservationHours} />
            </label>
            <label className="admin-check">
              <input type="checkbox" name="taxEnabled" defaultChecked={settings.taxEnabled} />
              <span>Tax calculation enabled</span>
            </label>
          </div>
          <button className="admin-primary" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}
    </section>
  );
}
