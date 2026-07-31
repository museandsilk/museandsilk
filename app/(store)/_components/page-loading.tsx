/** Shown automatically by Next.js (via the route-segment loading.tsx convention) while a page's
 * server-side data fetch is in flight — e.g. a cold request before ISR has cached the page. Kept
 * brief and quiet: a centered spinner, not a full skeleton, since most pages resolve in well under
 * a second and a heavier loading state would just be noise for how rarely it's seen. */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--muted)",
      }}
      role="status"
      aria-live="polite"
    >
      <span className="busy-label">
        <span className="spinner" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}
