import { logError } from "@/lib/error-log";
import { reportServerError } from "@/lib/sentry-server";

// Called by Next.js for every error thrown while rendering or handling a request on the server.
export function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string; renderSource?: string },
) {
  const err = (error ?? {}) as { name?: string; message?: string; stack?: string; digest?: string };
  logError({ source: `${context.routeType}:${context.routePath}`, message: `${err.name ?? "Error"}: ${err.message ?? "Unknown error"}`, path: request.path, stack: err.stack });
  reportServerError(err, {
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
  });
}
