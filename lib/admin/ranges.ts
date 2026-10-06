// The periods offered on the admin Home screen. Kept apart from analytics.ts (which talks to the database) so the
// browser can import it without pulling server code into the page.

export const RANGES = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

export function isRangeKey(value: string | null | undefined): value is RangeKey {
  return RANGES.some((range) => range.key === value);
}
