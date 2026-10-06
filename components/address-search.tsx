"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MIN_QUERY, TYPING_PAUSE_MS, cleanQuery, type GeoSuggestion } from "@/lib/geo";

/**
 * "Find your address" box. It waits until the person stops typing (about half a second) before asking, never asks for
 * fewer than 3 letters, cancels an answer that is no longer wanted and remembers what it already looked up – so one
 * address costs a handful of requests, not one per key press. The person can always ignore it and type the address.
 */
export function AddressSearch({
  onPick,
  label = "Search for your address",
  placeholder = "Type a street, area or building…",
  className,
}: {
  onPick: (suggestion: GeoSuggestion) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [items, setItems] = useState<GeoSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [active, setActive] = useState(-1);
  const cache = useRef(new Map<string, GeoSuggestion[]>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const listId = useId();

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );

  function change(next: string) {
    setValue(next);
    setNote("");
    if (timer.current) clearTimeout(timer.current);
    controller.current?.abort();
    const query = cleanQuery(next);
    if (query.length < MIN_QUERY) {
      setItems([]);
      setOpen(false);
      setBusy(false);
      return;
    }
    const hit = cache.current.get(query.toLowerCase());
    if (hit) {
      setItems(hit);
      setOpen(true);
      setBusy(false);
      return;
    }
    setBusy(true);
    timer.current = setTimeout(async () => {
      const abort = new AbortController();
      controller.current = abort;
      try {
        const response = await fetch(`/api/geo/autocomplete?text=${encodeURIComponent(query)}`, { signal: abort.signal });
        const data = (await response.json()) as { suggestions?: GeoSuggestion[]; unavailable?: boolean };
        const list = data.suggestions ?? [];
        if (!data.unavailable) cache.current.set(query.toLowerCase(), list);
        setItems(list);
        setOpen(true);
        setActive(-1);
        if (data.unavailable) setNote("Address search is not available right now. Please type your address below.");
        else if (!list.length) setNote("No match found. Please type your address below.");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setNote("Address search is not available right now. Please type your address below.");
      } finally {
        if (controller.current === abort) setBusy(false);
      }
    }, TYPING_PAUSE_MS);
  }

  function pick(item: GeoSuggestion) {
    onPick(item);
    setValue(item.label);
    setOpen(false);
    setItems([]);
  }

  return (
    <div className={className} style={{ position: "relative" }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span>{label}</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-busy={busy}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(event) => change(event.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && items.length) {
              event.preventDefault();
              setActive((index) => (index + 1) % items.length);
            } else if (event.key === "ArrowUp" && items.length) {
              event.preventDefault();
              setActive((index) => (index <= 0 ? items.length - 1 : index - 1));
            } else if (event.key === "Enter" && open && active >= 0 && items[active]) {
              event.preventDefault();
              pick(items[active]);
            } else if (event.key === "Escape") setOpen(false);
          }}
        />
      </label>
      {busy && <small style={{ opacity: 0.7 }}>Searching…</small>}
      {note && !busy && <small style={{ opacity: 0.8 }}>{note}</small>}
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", margin: "4px 0 0", padding: 4, listStyle: "none", background: "var(--surface, #fff)", color: "var(--text, #111)", border: "1px solid var(--line, #ddd)", borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,.18)", maxHeight: 260, overflowY: "auto" }}
        >
          {items.map((item, index) => (
            <li key={item.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(item)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 10px", border: 0, borderRadius: 8, background: index === active ? "var(--sunk, #f2f2f2)" : "transparent", color: "inherit", font: "inherit", cursor: "pointer" }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
