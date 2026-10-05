import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Minimal server-side Sentry reporter. The full @sentry/nextjs server SDK (OpenTelemetry etc.) adds
 * ~1 MB gzipped to the Worker, which would push it over Cloudflare's size limit, so server errors
 * are reported with a single hand-built envelope POST instead. Browser errors use the real SDK
 * (instrumentation-client.ts). Never throws — reporting must not make a failing request worse.
 */
type ErrorLike = { name?: string; message?: string; stack?: string; digest?: string };

function parseDsn(dsn: string) {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    return { key: url.username, host: url.host, projectId };
  } catch {
    return null;
  }
}

export function reportServerError(
  error: ErrorLike,
  context: { method?: string; path?: string; routePath?: string; routeType?: string; renderSource?: string },
): void {
  try {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn || process.env.NODE_ENV !== "production") return;
    const parsed = parseDsn(dsn);
    if (!parsed) return;

    const eventId = crypto.randomUUID().replace(/-/g, "");
    const now = new Date();
    const event = {
      event_id: eventId,
      timestamp: now.getTime() / 1000,
      platform: "javascript",
      level: "error",
      environment: process.env.SENTRY_ENVIRONMENT || "production",
      server_name: "cloudflare-worker",
      exception: { values: [{ type: error.name || "Error", value: error.message || "Unknown error" }] },
      // Path only — query strings can carry order numbers / phone numbers.
      request: { method: context.method, url: context.path?.split("?")[0] },
      tags: { runtime: "cloudflare-worker", routeType: context.routeType, routePath: context.routePath, renderSource: context.renderSource },
      extra: { digest: error.digest, stack: error.stack?.slice(0, 6000) },
    };
    const body =
      JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn }) +
      "\n" +
      JSON.stringify({ type: "event" }) +
      "\n" +
      JSON.stringify(event);

    const send = fetch(`https://${parsed.host}/api/${parsed.projectId}/envelope/?sentry_version=7&sentry_key=${parsed.key}&sentry_client=na-worker%2F1`, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body,
    }).catch(() => {});

    getCloudflareContext({ async: true })
      .then(({ ctx }) => ctx.waitUntil(send))
      .catch(() => {
        // No Workers context (local dev) — the request is already in flight.
      });
  } catch {
    // swallow
  }
}
