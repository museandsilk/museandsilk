// TikTok Pixel events. The pixel itself is only loaded after the visitor accepts analytics
// (app/analytics-consent.tsx), and it loads a moment after the page — so an event fired right away
// waits briefly for it instead of being lost. Without consent nothing is ever sent.

type Ttq = { track: (event: string, params?: Record<string, unknown>) => void };

export type TiktokContent = { content_id: string; content_type: "product"; content_name: string };

export function ttqTrack(event: string, params: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem("muse-cookie-choice") !== "accepted") return;
  } catch {
    return;
  }
  let tries = 0;
  const attempt = () => {
    const ttq = (window as Window & { ttq?: Ttq }).ttq;
    if (ttq) {
      try {
        ttq.track(event, params);
      } catch {
        /* tracking must never break the shop */
      }
      return;
    }
    if (++tries < 24) window.setTimeout(attempt, 500);
  };
  attempt();
}

export const ttqContent = (id: string, name: string): TiktokContent => ({ content_id: id, content_type: "product", content_name: name });
