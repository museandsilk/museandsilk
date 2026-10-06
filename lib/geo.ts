// Address search (Geoapify). The key stays on the server: browsers ask our own /api/geo/* routes, which also cache answers.

export type GeoSuggestion = { id: string; label: string; address: string; city: string; lat: number; lon: number };

type GeoFeature = { properties?: Record<string, unknown> };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Geoapify autocomplete answer → the few fields the shop needs. Anything unexpected is skipped, never thrown. */
export function parseSuggestions(json: unknown): GeoSuggestion[] {
  const features = (json as { features?: GeoFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: GeoSuggestion[] = [];
  for (const feature of features) {
    const p = (feature as GeoFeature | null)?.properties ?? {};
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    const label = text(p.formatted);
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const street = [text(p.housenumber), text(p.street)].filter(Boolean).join(" ");
    const place = [text(p.name) && text(p.name) !== street ? text(p.name) : "", street, text(p.suburb) || text(p.district)].filter(Boolean).join(", ");
    out.push({
      id: text(p.place_id) || `${lat},${lon}`,
      label,
      address: place || label,
      city: text(p.city) || text(p.town) || text(p.county) || text(p.state_district),
      lat,
      lon,
    });
  }
  return out;
}

/** Cleans what the shopper typed before it is sent anywhere: collapse spaces, cap the length. */
export function cleanQuery(value: string | null | undefined): string {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export const MIN_QUERY = 3;
/** How long the shopper must stop typing before a request is sent. */
export const TYPING_PAUSE_MS = 450;

export function mapsLink(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}
