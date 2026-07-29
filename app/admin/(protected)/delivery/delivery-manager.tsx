"use client";

import { FormEvent, useEffect, useState } from "react";

type Zone = {
  id: string;
  name: string;
  cities: string[];
  provinces: string[];
  deliveryCharge: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  active: boolean;
  sortOrder: number;
};

const displayList = (value: string[]) => value.join(", ");

export function DeliveryManager() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/delivery-zones", { cache: "no-store" });
    if (response.ok) setZones((await response.json()).zones);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"),
      cities: form.get("cities"),
      provinces: form.get("provinces"),
      deliveryCharge: form.get("deliveryCharge"),
      estimatedDaysMin: form.get("estimatedDaysMin"),
      estimatedDaysMax: form.get("estimatedDaysMax"),
      sortOrder: form.get("sortOrder"),
      active: form.get("active") === "on",
    };
    const response = await fetch(id ? `/api/admin/delivery-zones/${id}` : "/api/admin/delivery-zones", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setMessage(response.ok ? "Delivery zones updated." : result.error ?? "Delivery zone could not be saved.");
    if (response.ok) {
      if (!id) event.currentTarget.reset();
      await refresh();
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Deactivate this delivery zone?")) return;
    const response = await fetch(`/api/admin/delivery-zones/${id}`, { method: "DELETE" });
    setMessage(response.ok ? "Delivery zone deactivated." : "Could not deactivate zone.");
    if (response.ok) await refresh();
  }

  return (
    <section className="admin-main">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Muse &amp; Silk</p>
          <h1>Delivery Zones</h1>
        </div>
      </header>
      {message && (
        <div className="admin-message" role="status">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}
      <div className="delivery-manager">
        <section>
          {zones.map((zone) => (
            <form key={zone.id} className="zone-editor" onSubmit={(event) => submit(event, zone.id)}>
              <input name="name" defaultValue={zone.name} aria-label="Zone name" />
              <input name="cities" defaultValue={displayList(zone.cities)} placeholder="Cities, comma separated" />
              <input name="provinces" defaultValue={displayList(zone.provinces)} placeholder="Provinces, comma separated" />
              <label>
                Charge
                <input type="number" min="0" name="deliveryCharge" defaultValue={zone.deliveryCharge} />
              </label>
              <label>
                Minimum days
                <input type="number" min="1" name="estimatedDaysMin" defaultValue={zone.estimatedDaysMin} />
              </label>
              <label>
                Maximum days
                <input type="number" min="1" name="estimatedDaysMax" defaultValue={zone.estimatedDaysMax} />
              </label>
              <label>
                Order
                <input type="number" min="0" name="sortOrder" defaultValue={zone.sortOrder} />
              </label>
              <label className="admin-check">
                <input type="checkbox" name="active" defaultChecked={zone.active} />
                <span>Active</span>
              </label>
              <button>Save zone</button>
              <button type="button" onClick={() => remove(zone.id)}>
                Deactivate
              </button>
            </form>
          ))}
          {!zones.length && (
            <div className="admin-empty">
              <h3>No delivery zones yet</h3>
              <p>Add your first zone to start calculating shipping charges.</p>
            </div>
          )}
        </section>
        <form className="campaign-upload" onSubmit={(event) => submit(event)}>
          <p className="eyebrow">New area</p>
          <h2>Add delivery zone</h2>
          <label>
            <span>Name</span>
            <input required name="name" />
          </label>
          <label>
            <span>Cities, comma separated</span>
            <textarea name="cities" rows={3} />
          </label>
          <label>
            <span>Provinces, comma separated</span>
            <textarea name="provinces" rows={3} />
          </label>
          <label>
            <span>Delivery charge (PKR)</span>
            <input required type="number" min="0" name="deliveryCharge" />
          </label>
          <div>
            <label>
              <span>Minimum days</span>
              <input type="number" min="1" name="estimatedDaysMin" defaultValue="2" />
            </label>
            <label>
              <span>Maximum days</span>
              <input type="number" min="1" name="estimatedDaysMax" defaultValue="5" />
            </label>
          </div>
          <label className="admin-check">
            <input type="checkbox" name="active" defaultChecked />
            <span>Active</span>
          </label>
          <button className="admin-primary">Add delivery zone</button>
        </form>
      </div>
    </section>
  );
}
