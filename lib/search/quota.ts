/** True when an Algolia failure means "it will keep refusing" (free allowance used up, key disabled) rather than "try again in a moment". */
export function isQuotaError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  return status === 429 || status === 403 || status === 402 || /quota|limit|exceed|blocked|disabled|too many/.test(message);
}
