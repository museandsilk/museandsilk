import { expect, test } from "@playwright/test";
import { cleanQuery, MIN_QUERY, parseSuggestions } from "../../lib/geo";

test.describe("address search helpers", () => {
  test("cleanQuery collapses spaces, strips control characters and caps the length", () => {
    expect(cleanQuery("  Park   Lane \n Tower\u0000 ")).toBe("Park Lane Tower");
    expect(cleanQuery(null)).toBe("");
    expect(cleanQuery("x".repeat(500))).toHaveLength(120);
    expect(MIN_QUERY).toBe(3);
  });

  test("parseSuggestions keeps real places and skips anything incomplete or unexpected", () => {
    const json = {
      features: [
        { properties: { formatted: "Mall of Lahore, Tufail Road, Lahore, Pakistan", name: "Mall of Lahore", street: "Tufail Road", city: "Lahore", lat: 31.5, lon: 74.37, place_id: "abc" } },
        { properties: { formatted: "No coordinates" } },
        { properties: { lat: 1, lon: 2 } },
        null,
        {},
      ],
    };
    const out = parseSuggestions(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "abc", city: "Lahore", lat: 31.5, lon: 74.37 });
    expect(out[0].address).toContain("Mall of Lahore");
    expect(parseSuggestions(undefined)).toEqual([]);
    expect(parseSuggestions({ features: "nope" })).toEqual([]);
  });
});
