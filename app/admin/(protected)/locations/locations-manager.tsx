"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddressSearch } from "@/components/address-search";
import { mapsLink } from "@/lib/geo";
import { useLockedAction } from "@/lib/use-locked-action";
import { callApi, Dialog, useToast } from "../../_ui/client";
import { Icon } from "../../_ui/icons";
import { Badge, EmptyState } from "../../_ui/ui";

export type LocationRow = { id: string; name: string; address: string; city: string; phone: string; hours: string; latitude: number | null; longitude: number | null; isMain: boolean; active: boolean };
type Draft = Omit<LocationRow, "id"> & { id?: string };

const blank: Draft = { name: "", address: "", city: "", phone: "", hours: "", latitude: null, longitude: null, isMain: false, active: true };

export function LocationsManager({ initial }: { initial: LocationRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const saver = useLockedAction();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<LocationRow | null>(null);
  const [error, setError] = useState("");

  async function save() {
    if (!editing) return;
    setError("");
    await saver.run(async () => {
      const body = { name: editing.name, address: editing.address, city: editing.city, phone: editing.phone, hours: editing.hours, latitude: editing.latitude, longitude: editing.longitude, isMain: editing.isMain, active: editing.active };
      const result = editing.id ? await callApi(`/api/admin/locations/${editing.id}`, "PATCH", body) : await callApi("/api/admin/locations", "POST", body);
      if (!result.ok) return setError(result.error);
      toast(editing.id ? "Shop saved." : "Shop added.", "good");
      setEditing(null);
      router.refresh();
    });
  }

  async function toggle(row: LocationRow) {
    const result = await callApi(`/api/admin/locations/${row.id}`, "PATCH", { active: !row.active });
    if (result.ok) router.refresh();
    else toast(result.error, "bad");
  }

  async function makeMain(row: LocationRow) {
    const result = await callApi(`/api/admin/locations/${row.id}`, "PATCH", { isMain: true });
    if (result.ok) {
      toast(`${row.name} is now your main shop.`, "good");
      router.refresh();
    } else toast(result.error, "bad");
  }

  async function remove() {
    if (!removing) return;
    const result = await callApi(`/api/admin/locations/${removing.id}`, "DELETE");
    if (result.ok) {
      toast("Shop removed.", "good");
      setRemoving(null);
      router.refresh();
    } else {
      toast(result.error, "bad");
      setRemoving(null);
    }
  }

  const set = (patch: Partial<Draft>) => setEditing((current) => (current ? { ...current, ...patch } : current));

  return (
    <div className="a-stack">
      <div className="a-row">
        <button type="button" className="a-btn a-btn-primary" onClick={() => { setError(""); setEditing({ ...blank }); }}>
          <Icon name="plus" /> Add a shop
        </button>
      </div>

      <section className="a-card">
        {initial.length ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {initial.map((row) => (
              <li key={row.id} className="a-row" style={{ padding: "16px 20px", borderTop: "1px solid var(--line)", alignItems: "flex-start", opacity: row.active ? 1 : 0.6 }}>
                <span style={{ color: "var(--muted)", paddingTop: 2 }}>
                  <Icon name="pin" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>
                    {row.name} {row.isMain && <Badge tone="done">Main shop</Badge>} {!row.active && <Badge tone="muted">Hidden</Badge>}
                  </strong>
                  <div>{row.address}{row.city ? `, ${row.city}` : ""}</div>
                  <small className="a-muted">
                    {[row.phone, row.hours].filter(Boolean).join(" · ") || "No phone or opening hours added"}
                    {row.latitude != null && row.longitude != null && (
                      <>
                        {" · "}
                        <a href={mapsLink(row.latitude, row.longitude)} target="_blank" rel="noreferrer noopener" style={{ textDecoration: "underline" }}>
                          See on map
                        </a>
                      </>
                    )}
                  </small>
                </div>
                <div className="a-row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {!row.isMain && (
                    <button type="button" className="a-btn a-btn-sm" onClick={() => makeMain(row)}>
                      Make main
                    </button>
                  )}
                  {!row.isMain && (
                    <button type="button" className="a-btn a-btn-sm" onClick={() => toggle(row)}>
                      {row.active ? "Hide" : "Show on website"}
                    </button>
                  )}
                  <button type="button" className="a-btn a-btn-sm" onClick={() => { setError(""); setEditing(row); }}>
                    Edit
                  </button>
                  {!row.isMain && (
                    <button type="button" className="a-icon-btn" aria-label={`Remove ${row.name}`} title="Remove this shop" onClick={() => setRemoving(row)}>
                      <Icon name="trash" size={18} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="pin" title="No shops yet">Press “Add a shop” to list your first one.</EmptyState>
        )}
      </section>

      {editing && (
        <Dialog title={editing.id ? "Edit shop" : "Add a shop"} onClose={() => setEditing(null)}>
          <form
            className="a-stack"
            style={{ gap: 12 }}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <AddressSearch
              label="Find the address (optional)"
              onPick={(found) => set({ address: found.address, city: found.city || editing.city, latitude: found.lat, longitude: found.lon })}
            />
            <div className="a-field">
              <label htmlFor="loc-name">Shop name</label>
              <input id="loc-name" value={editing.name} onChange={(event) => set({ name: event.target.value })} placeholder="e.g. Nure Asmir – Mall of Lahore" maxLength={80} />
            </div>
            <div className="a-field">
              <label htmlFor="loc-address">Full address</label>
              <textarea id="loc-address" value={editing.address} onChange={(event) => set({ address: event.target.value, latitude: editing.address === event.target.value ? editing.latitude : null, longitude: editing.address === event.target.value ? editing.longitude : null })} rows={3} maxLength={300} />
              <span className="a-help">{editing.latitude != null ? "Map pin saved from the address search." : "No map pin yet – pick a line in the search box above to add one (optional)."}</span>
            </div>
            <div className="a-form-grid">
              <div className="a-field">
                <label htmlFor="loc-city">City</label>
                <input id="loc-city" value={editing.city} onChange={(event) => set({ city: event.target.value })} maxLength={60} />
              </div>
              <div className="a-field">
                <label htmlFor="loc-phone">Phone (optional)</label>
                <input id="loc-phone" value={editing.phone} onChange={(event) => set({ phone: event.target.value })} placeholder="+92 3xx xxxxxxx" maxLength={30} />
              </div>
              <div className="a-field wide">
                <label htmlFor="loc-hours">Opening hours (optional)</label>
                <input id="loc-hours" value={editing.hours} onChange={(event) => set({ hours: event.target.value })} placeholder="e.g. Every day, 12 pm – 10 pm" maxLength={120} />
              </div>
            </div>
            {error && (
              <p className="a-error" role="alert">
                {error}
              </p>
            )}
            <div className="a-dialog-actions">
              <button type="button" className="a-btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="a-btn a-btn-primary" disabled={saver.pending} aria-busy={saver.pending}>
                {saver.pending ? "Saving…" : "Save shop"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {removing && (
        <Dialog title={`Remove “${removing.name}”?`} onClose={() => setRemoving(null)}>
          <p>It will no longer be shown on your website. You can add it again later.</p>
          <div className="a-dialog-actions">
            <button type="button" className="a-btn" onClick={() => setRemoving(null)}>
              Go back
            </button>
            <button type="button" className="a-btn a-btn-danger" onClick={remove}>
              Remove shop
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
