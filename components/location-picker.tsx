"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AddressSearch } from "@/components/address-search";
import { insidePakistan, type GeoSuggestion, type ReverseResult } from "@/lib/geo";

export type PickedPlace = { address: string; city: string; province: string | null; lat: number; lon: number };

type Status = { tone: "info" | "good" | "bad"; text: string } | null;

const LAHORE: [number, number] = [31.5204, 74.3587];

async function reverse(lat: number, lon: number): Promise<{ result?: ReverseResult; outside?: boolean; unavailable?: boolean }> {
  try {
    const response = await fetch(`/api/geo/reverse?lat=${lat}&lon=${lon}`);
    const data = (await response.json()) as { result?: ReverseResult | null; outside?: boolean; unavailable?: boolean };
    if (data.outside) return { outside: true };
    if (data.unavailable || !data.result) return { unavailable: true };
    return { result: data.result };
  } catch {
    return { unavailable: true };
  }
}

/**
 * Three ways to say where the parcel goes, all optional – the shopper can always just type the address:
 *   1. "Use my current location" (asks the browser for permission, then fills in the address)
 *   2. a search box with suggestions (waits until they stop typing)
 *   3. a map with a pin they can drag
 * The map library is only downloaded when the map is opened, so the checkout stays light.
 */
export function LocationPicker({ onPick }: { onPick: (place: PickedPlace) => void }) {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [start, setStart] = useState<[number, number]>(LAHORE);
  const [pin, setPin] = useState<{ lat: number; lon: number; label: string; result?: ReverseResult } | null>(null);

  const apply = useCallback(
    (result: ReverseResult) => {
      onPick({ address: result.address, city: result.city, province: result.province, lat: result.lat, lon: result.lon });
      setStatus({ tone: "good", text: `Location set: ${result.label}` });
    },
    [onPick],
  );

  async function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setStatus({ tone: "bad", text: "This browser cannot share your location. Please search for your address or pick it on the map." });
      return;
    }
    setBusy(true);
    setStatus({ tone: "info", text: "Waiting for your permission to find your location…" });
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        if (!insidePakistan(latitude, longitude)) {
          setBusy(false);
          setStatus({ tone: "bad", text: "Your location looks like it is outside Pakistan. Please search for your delivery address or pick it on the map." });
          return;
        }
        setStart([latitude, longitude]);
        const found = await reverse(latitude, longitude);
        setBusy(false);
        if (found.result) apply(found.result);
        else setStatus({ tone: "bad", text: "We found you, but could not turn it into an address. Please pick it on the map or type it below." });
      },
      (error) => {
        setBusy(false);
        setStatus({
          tone: "bad",
          text:
            error.code === error.PERMISSION_DENIED
              ? "Location is blocked for this website. You can allow it with the padlock next to the web address – or search for your address or pick it on the map instead."
              : error.code === error.TIMEOUT
                ? "Finding your location took too long. Please try again, search for your address, or pick it on the map."
                : "We could not find your location. Please search for your address or pick it on the map.",
        });
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  }

  function fromSearch(found: GeoSuggestion) {
    setStart([found.lat, found.lon]);
    onPick({ address: found.address, city: found.city, province: found.province ?? null, lat: found.lat, lon: found.lon });
    setStatus({ tone: "good", text: `Location set: ${found.label}` });
  }

  return (
    <div className="lp field-wide">
      <div className="lp-actions">
        <button type="button" className="lp-btn" onClick={useMyLocation} disabled={busy} aria-busy={busy}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></svg>
          {busy ? "Finding you…" : "Use my current location"}
        </button>
        <button type="button" className="lp-btn" onClick={() => setMapOpen((open) => !open)} aria-expanded={mapOpen}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
          {mapOpen ? "Hide map" : "Pick on the map"}
        </button>
      </div>
      <AddressSearch label="Or search for your address" onPick={fromSearch} />
      {status && (
        <p className={`lp-status lp-${status.tone}`} role={status.tone === "bad" ? "alert" : "status"}>
          {status.text}
        </p>
      )}
      {mapOpen && (
        <div className="lp-map-wrap">
          <PinMap
            start={start}
            onMove={async (lat, lon) => {
              setPin({ lat, lon, label: "Finding the address…" });
              const found = await reverse(lat, lon);
              if (found.outside) setPin({ lat, lon, label: "That spot is outside Pakistan." });
              else if (found.result) setPin({ lat, lon, label: found.result.label, result: found.result });
              else setPin({ lat, lon, label: "Address not available here – you can still type it below." });
            }}
          />
          <div className="lp-confirm">
            <span>{pin?.label ?? "Drag the pin (or tap the map) to your door."}</span>
            <button type="button" className="lp-btn lp-solid" disabled={!pin?.result} onClick={() => pin?.result && (apply(pin.result), setMapOpen(false))}>
              Use this location
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The map. Loaded on demand (the map library is not part of the checkout page until it is needed). */
function PinMap({ start, onMove }: { start: [number, number]; onMove: (lat: number, lon: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const handler = useRef(onMove);
  useEffect(() => {
    handler.current = onMove;
  });

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;
    (async () => {
      const [{ default: L }] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
      if (cancelled || !box.current) return;
      const map = L.map(box.current, { center: start, zoom: 16, minZoom: 5, maxZoom: 18, zoomControl: true, attributionControl: true });
      L.tileLayer("/api/geo/tiles/{z}/{x}/{y}", { minZoom: 5, maxZoom: 18, attribution: "© OpenStreetMap contributors · Geoapify" }).addTo(map);
      const marker = L.marker(start, { draggable: true, keyboard: true, title: "Drag me to your door", icon: L.divIcon({ className: "lp-pin", html: "<span></span>", iconSize: [28, 38], iconAnchor: [14, 38] }) }).addTo(map);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const report = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const at = marker.getLatLng();
          handler.current(at.lat, at.lng);
        }, 500);
      };
      marker.on("dragend", report);
      map.on("click", (event: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(event.latlng);
        report();
      });
      report();
      teardown = () => {
        clearTimeout(timer);
        map.remove();
      };
    })();
    return () => {
      cancelled = true;
      teardown?.();
    };
    // the map is created once; later moves are reported through `handler`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={box} className="lp-map" role="application" aria-label="Map: drag the pin to your delivery address" />;
}
