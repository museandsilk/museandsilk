import { expect, test } from "@playwright/test";
import { foldActions, lastTarget } from "../../app/admin/(protected)/training/engine";
import { LESSONS } from "../../app/admin/(protected)/training/lessons";

test.describe("training lessons", () => {
  test("there are lessons, each with a title, minutes and several steps with narration", () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(LESSONS.map((l) => l.id)).size, "unique ids").toBe(LESSONS.length);
    for (const lesson of LESSONS) {
      expect(lesson.title.length).toBeGreaterThan(5);
      expect(lesson.minutes).toBeGreaterThanOrEqual(1);
      expect(lesson.steps.length).toBeGreaterThanOrEqual(3);
      for (const step of lesson.steps) expect(step.say.length, `${lesson.id}: narration`).toBeGreaterThan(20);
    }
  });

  test("typing and clicking fold into the screen's state, and the cursor rests on the last thing it touched", () => {
    const lesson = LESSONS.find((l) => l.id === "product")!;
    const step = lesson.steps[1];
    expect(foldActions([step]).name).toBe("Ivory Cotton Kurta");
    expect(lastTarget(step)).toBe("f-type");
    expect(foldActions(lesson.steps.slice(0, 4)).sizes).toBe("5");
  });
});
