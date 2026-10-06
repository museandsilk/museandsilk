import { expect, test } from "@playwright/test";
import { estimateSeconds, foldActions, lastTarget, type Step } from "../../lib/training-engine";

// The lessons themselves (every one of them, every step, every place the cursor points) are checked in a real browser:
// see "training: every lesson steps through…" in e2e/ui/admin.spec.ts. This file checks the script engine on its own.
const step = (actions: Step["actions"]): Step => ({ say: "x", screen: () => null, actions });

test.describe("training engine", () => {
  test("typing and clicking fold into the screen's state, in order, without touching the starting state", () => {
    const start = { keep: "1" };
    const state = foldActions([step([{ t: "type", into: "a", key: "name", text: "Kurta" }]), step([{ t: "click", on: "b", set: { sizes: "5" } }, { t: "wait", ms: 10 }])], start);
    expect(state).toEqual({ keep: "1", name: "Kurta", sizes: "5" });
    expect(start).toEqual({ keep: "1" });
  });

  test("the cursor rests on the last thing it touched, or nowhere when a step has no actions", () => {
    expect(lastTarget(step([{ t: "move", to: "a" }, { t: "click", on: "b" }, { t: "wait", ms: 5 }]))).toBe("b");
    expect(lastTarget(step([{ t: "type", into: "field", key: "k", text: "x" }]))).toBe("field");
    expect(lastTarget(step(undefined))).toBeNull();
  });

  test("a lesson's length estimate grows with its steps and its typing", () => {
    const short = estimateSeconds([step(undefined)]);
    const long = estimateSeconds([step(undefined), step([{ t: "type", into: "a", key: "k", text: "a long piece of typed text here" }])]);
    expect(short).toBeGreaterThan(3);
    expect(long).toBeGreaterThan(short * 2);
  });
});
