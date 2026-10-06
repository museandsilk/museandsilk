import type { ReactNode } from "react";

/**
 * The training player's script format. A lesson is a list of steps; each step has a narration line, a mock screen drawn from the
 * current "state" (what has been typed or clicked so far), and the actions the pretend cursor performs on it. Pure data + one tiny
 * folding function, so lessons stay easy to write and the logic is tested without a browser.
 */
export type TourState = Record<string, string>;

export type Action =
  | { t: "move"; to: string }
  | { t: "click"; on: string; set?: TourState }
  | { t: "type"; into: string; key: string; text: string }
  | { t: "wait"; ms: number };

export type Step = {
  /** What the narrator says – plain, short, in the order the owner will do it. */
  say: string;
  /** The mock screen for this moment. */
  screen: (state: TourState) => ReactNode;
  actions?: Action[];
  /** Extra seconds to stay on the finished step before moving on (default about 1.6). */
  hold?: number;
};

export type Lesson = { id: string; title: string; minutes: number; blurb: string; steps: Step[] };

/** What the screen looks like once the actions of these steps have all happened. */
export function foldActions(steps: Array<Pick<Step, "actions">>, from: TourState = {}): TourState {
  const state: TourState = { ...from };
  for (const step of steps) {
    for (const action of step.actions ?? []) {
      if (action.t === "click" && action.set) Object.assign(state, action.set);
      if (action.t === "type") state[action.key] = action.text;
    }
  }
  return state;
}

/** The last thing the cursor touched in a step (where it rests when the step is shown without playing). */
export function lastTarget(step: Pick<Step, "actions">): string | null {
  const actions = step.actions ?? [];
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    if (action.t === "move") return action.to;
    if (action.t === "click") return action.on;
    if (action.t === "type") return action.into;
  }
  return null;
}

/** Minutes of narration in a lesson (about 5 seconds a step plus the time spent on each action), for the "3 min" label. */
export function estimateSeconds(steps: Step[]): number {
  return steps.reduce((sum, step) => sum + 3 + (step.hold ?? 1.6) + (step.actions ?? []).reduce((acc, a) => acc + (a.t === "type" ? Math.min(3, a.text.length * 0.06) : a.t === "wait" ? a.ms / 1000 : 0.9), 0), 0);
}
