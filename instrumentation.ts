import { reportServerError } from "@/lib/sentry-server";

// Called by Next.js for every error thrown while rendering or handling a request on the server.
export function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string; renderSource?: string },
) {
  const err = (error ?? {}) as { name?: string; message?: string; stack?: string; digest?: string };
  reportServerError(err, {
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
  });
}
