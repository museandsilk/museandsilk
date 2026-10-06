"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { ALL_PAGES } from "./nav";

type Result = { group: string; label: string; sub?: string; href: string };

/** Ctrl+K / "/" quick finder: type an order number, a customer's name or phone, a product, or a page name. */
export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setRemote([]);
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemote([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        if (!cancelled && response.ok) setRemote(((await response.json()) as { results: Result[] }).results);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const pages = useMemo<Result[]>(() => {
    const term = query.trim().toLowerCase();
    return ALL_PAGES.filter((page) => !term || page.label.toLowerCase().includes(term)).map((page) => ({ group: "Go to", label: page.label, href: page.href }));
  }, [query]);

  const results = [...remote, ...pages].slice(0, 14);

  function go(result: Result | undefined) {
    if (!result) return;
    close();
    router.push(result.href);
  }

  return (
    <>
      <button type="button" className="adm-search-btn" onClick={() => setOpen(true)} aria-label="Search orders, customers and products">
        <Icon name="search" size={18} />
        Search orders, customers, products…
        <kbd>Ctrl K</kbd>
      </button>
      {open && (
        <div className="a-scrim" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <div className="a-palette" role="dialog" aria-modal="true" aria-label="Search">
            <input
              ref={inputRef}
              value={query}
              placeholder="Type an order number, a name, a phone number or a product…"
              aria-label="Search"
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((value) => Math.min(results.length - 1, value + 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((value) => Math.max(0, value - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  go(results[active]);
                }
              }}
            />
            <ul>
              {results.map((result, index) => (
                <li key={`${result.href}-${index}`}>
                  {(index === 0 || results[index - 1].group !== result.group) && <p className="group">{result.group}</p>}
                  <a
                    href={result.href}
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={(event) => {
                      event.preventDefault();
                      go(result);
                    }}
                  >
                    <span>
                      <strong>{result.label}</strong>
                      {result.sub && <small> — {result.sub}</small>}
                    </span>
                  </a>
                </li>
              ))}
              {busy && <li className="a-faint" style={{ padding: "10px 12px" }}>Searching…</li>}
              {!busy && query.trim().length >= 2 && !remote.length && <li className="a-faint" style={{ padding: "10px 12px" }}>No order, customer or product found for “{query.trim()}”.</li>}
            </ul>
            <p className="foot">↑ ↓ to choose · Enter to open · Esc to close</p>
          </div>
        </div>
      )}
    </>
  );
}
