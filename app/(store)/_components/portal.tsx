"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => undefined;

/**
 * Draws its children directly under <body>. Full-screen layers (the filter panel, the photo viewer) must not live inside the page's
 * fade-in wrapper: an animated ancestor turns "fixed" into "fixed inside me", which puts the layer underneath the sticky header
 * (its ✕ could not be tapped on a phone). On the server it draws nothing.
 */
export function Portal({ children }: { children: ReactNode }) {
  const target = useSyncExternalStore(subscribe, () => document.body, () => null);
  return target ? createPortal(children, target) : null;
}
