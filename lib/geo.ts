// Address search (Geoapify). The key stays on the server: browsers ask our own /api/geo/* routes, which also cache answers.

export type GeoSuggestion = { id: string; label: string; address: string; city: string; province?: string | null; lat: number; lon: number };

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
      province: provinceFromState(text(p.state), text(p.city)),
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

/* ---- GPS / map pin → address ---- */

export const PROVINCES = ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Jammu and Kashmir"] as const;

/** Geoapify's "state" text → the province names the checkout uses (null when it is not clearly one of them). */
export function provinceFromState(state: string | null | undefined, city?: string | null): string | null {
  const text = `${state ?? ""} ${city ?? ""}`.toLowerCase();
  if (!text.trim()) return null;
  if (/islamabad/.test(text)) return "Islamabad Capital Territory";
  if (/khyber|pakhtun|k\.?p\.?k|nwfp/.test(text)) return "Khyber Pakhtunkhwa";
  if (/gilgit|baltistan/.test(text)) return "Gilgit-Baltistan";
  if (/azad|kashmir|ajk/.test(text)) return "Azad Jammu and Kashmir";
  if (/balochistan|baluchistan/.test(text)) return "Balochistan";
  if (/sindh|sind\b/.test(text)) return "Sindh";
  if (/punjab/.test(text)) return "Punjab";
  return null;
}

/** Roughly the box around Pakistan – a pin outside it is almost certainly a mistake (or a stray GPS reading). */
export function insidePakistan(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 23.4 && lat <= 37.2 && lon >= 60.8 && lon <= 77.9;
}

export type ReverseResult = { label: string; address: string; city: string; province: string | null; lat: number; lon: number };

/** Geoapify reverse-geocoding answer → what the checkout form needs. */
export function parseReverse(json: unknown, lat: number, lon: number): ReverseResult | null {
  const p = ((json as { features?: Array<{ properties?: Record<string, unknown> }> } | null)?.features?.[0]?.properties ?? null) as Record<string, unknown> | null;
  if (!p) return null;
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const label = str(p.formatted);
  if (!label) return null;
  const street = [str(p.housenumber), str(p.street)].filter(Boolean).join(" ");
  const name = str(p.name) && str(p.name) !== street ? str(p.name) : "";
  const address = [name, street, str(p.suburb) || str(p.district)].filter(Boolean).join(", ") || label;
  const city = str(p.city) || str(p.town) || str(p.village) || str(p.county) || str(p.state_district);
  return { label, address, city, province: provinceFromState(str(p.state), city), lat, lon };
}

/** One map tile is identified by zoom/x/y; reject anything that is not a real tile address (keeps the proxy from being used as an open relay). */
export function validTile(z: number, x: number, y: number): boolean {
  if (![z, x, y].every(Number.isInteger) || z < 5 || z > 18) return false;
  const max = 2 ** z;
  return x >= 0 && y >= 0 && x < max && y < max;
}

export type ZoneLike = { id: string; cities?: string[]; provinces?: string[] };

/**
 * Which delivery area does a place belong to?
 *  1. an area that names the city (Lahore → "Lahore & Islamabad")
 *  2. otherwise a catch-all area – one with no cities listed – that covers the province ("KPK" and "Khyber Pakhtunkhwa" count as the same)
 * A place that fits neither gets null, and the shopper chooses.
 */
export function matchZone<T extends ZoneLike>(zones: T[], city: string | null | undefined, province: string | null | undefined): T | null {
  const wantedCity = (city ?? "").trim().toLowerCase();
  if (wantedCity) {
    const byCity = zones.find((zone) => (zone.cities ?? []).some((name) => name.trim().toLowerCase() === wantedCity));
    if (byCity) return byCity;
  }
  const wantedProvince = provinceFromState(province);
  if (!wantedProvince) return null;
  return zones.find((zone) => (zone.cities ?? []).length === 0 && (zone.provinces ?? []).some((name) => provinceFromState(name) === wantedProvince)) ?? null;
}
