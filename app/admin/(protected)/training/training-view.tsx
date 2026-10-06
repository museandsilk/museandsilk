"use client";

import { LESSONS } from "./lessons";
import { TrainingPlayer } from "./player";

export function TrainingView({ initialLesson }: { initialLesson?: string }) {
  return <TrainingPlayer lessons={LESSONS} initialLesson={initialLesson} />;
}
