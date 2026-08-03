/** True if the given error is a Postgres unique-constraint violation (SQLSTATE 23505). Thrown by
 * @neondatabase/serverless as a NeonDbError with a `.code` property matching the Postgres error
 * code — but drizzle-orm's query logger wraps it in an outer "Failed query" Error and moves the
 * original NeonDbError to `.cause`, so the code must be checked at both levels. Use this to turn
 * an expected conflict (duplicate SKU, slug, email, etc.) into a clean 409 response instead of an
 * uncaught exception reaching the client as a raw 500. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (value: unknown): unknown => (typeof value === "object" && value !== null && "code" in value ? (value as { code?: unknown }).code : undefined);
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
}
