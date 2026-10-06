"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../_ui/icons";
import { foldActions, lastTarget, type Lesson, type TourState } from "@/lib/training-engine";

const SPEEDS = [1, 1.5, 2] as const;
const DONE_KEY = "adm-training-done";

function readDone(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DONE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The video-style player: it plays a lesson on a pretend screen with a moving cursor, typing and clicks, and narrates each step.
 * It is not a recording – it is drawn live with the same colours and shapes as the real admin, so it always matches, loads
 * instantly and needs no video bandwidth. Everything can be paused, stepped and replayed; with "reduce motion" it never autoplays.
 */
export function TrainingPlayer({ lessons, initialLesson }: { lessons: Lesson[]; initialLesson?: string }) {
  const startIndex = Math.max(0, lessons.findIndex((lesson) => lesson.id === initialLesson));
  const [lessonIndex, setLessonIndex] = useState(startIndex);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [live, setLive] = useState<TourState>({});
  const [cursor, setCursor] = useState<{ x: number; y: number; visible: boolean; click: number }>({ x: 40, y: 40, visible: false, click: 0 });
  const [finished, setFinished] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [replay, setReplay] = useState(0);
  const [missing, setMissing] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [wide, setWide] = useState(false);

  const lesson = lessons[lessonIndex];
  const step = lesson.steps[stepIndex];
  const base = useMemo(() => foldActions(lesson.steps.slice(0, stepIndex)), [lesson, stepIndex]);

  useEffect(() => {
    // Saved progress lives in this browser only, so it can be read only after the page has loaded (reading it earlier would not match the server's page).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDone(readDone());
  }, []);

  const place = useCallback((target: string | null) => {
    const root = stage.current;
    if (!root || !target) return false;
    const element = root.querySelector<HTMLElement>(`[data-t="${target}"]`);
    if (!element) {
      setMissing(target);
      return false;
    }
    setMissing("");
    const box = root.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    setCursor((current) => ({ ...current, x: rect.left - box.left + Math.min(rect.width * 0.55, rect.width - 6), y: rect.top - box.top + rect.height * 0.6, visible: true }));
    return true;
  }, []);

  const markDone = useCallback((id: string) => {
    setDone((current) => {
      if (current.includes(id)) return current;
      const next = [...current, id];
      try {
        window.localStorage.setItem(DONE_KEY, JSON.stringify(next));
      } catch {
        // progress is a convenience only
      }
      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    if (stepIndex < lesson.steps.length - 1) setStepIndex(stepIndex + 1);
    else {
      markDone(lesson.id);
      setPlaying(false);
      setFinished(true);
    }
  }, [stepIndex, lesson, markDone]);

  // Each step: when playing, perform its actions one by one then move on; when paused, show the finished step with the cursor resting where it ended.
  useEffect(() => {
    let dead = false;
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms / speed));
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    // A new step starts from a clean screen; the player then plays or shows this step.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive({});
    setMissing("");
    // (The "finished" screen is cleared only by the buttons – never here, or it would vanish the moment the last step ends.)

    (async () => {
      await frame();
      if (dead) return;
      if (!playing) {
        setLive(foldActions([step]));
        const rest = lastTarget(step);
        if (rest) {
          await frame();
          if (!dead) place(rest);
        } else setCursor((c) => ({ ...c, visible: false }));
        return;
      }
      for (const action of step.actions ?? []) {
        if (dead) return;
        if (action.t === "wait") await sleep(action.ms);
        else if (action.t === "move") {
          setLive((s) => ({ ...s, hl: action.to }));
          place(action.to);
          await sleep(750);
        } else if (action.t === "click") {
          setLive((s) => ({ ...s, hl: action.on }));
          place(action.on);
          await sleep(750);
          if (dead) return;
          setCursor((c) => ({ ...c, click: c.click + 1 }));
          await sleep(220);
          if (dead) return;
          setLive((s) => ({ ...s, ...(action.set ?? {}) }));
          await sleep(500);
        } else if (action.t === "type") {
          setLive((s) => ({ ...s, hl: action.into }));
          place(action.into);
          await sleep(750);
          for (let i = 1; i <= action.text.length; i++) {
            if (dead) return;
            setLive((s) => ({ ...s, [action.key]: action.text.slice(0, i) }));
            await sleep(Math.max(25, Math.min(70, 1800 / action.text.length)));
          }
          await sleep(250);
        }
      }
      await sleep((step.hold ?? 1.6) * 1000);
      if (!dead) goNext();
    })();
    return () => {
      dead = true;
    };
  }, [lessonIndex, stepIndex, playing, speed, replay, step, place, goNext]);

  // Keep the pretend cursor on its target when the window is resized.
  useEffect(() => {
    const onResize = () => place(lastTarget(step));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [step, place]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // The pretend screen is re-measured after the layout changes size, so the cursor stays on its target.
  useEffect(() => {
    const id = window.setTimeout(() => place(lastTarget(step)), 250);
    return () => window.clearTimeout(id);
  }, [full, wide, step, place]);

  async function toggleFull() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      setWide((value) => !value); // this browser refuses full screen: the wide view is the next best thing
    }
  }

  function choose(index: number) {
    setLessonIndex(index);
    setStepIndex(0);
    setFinished(false);
    setPlaying(false);
    setReplay((n) => n + 1);
  }

  function play() {
    if (finished) {
      setStepIndex(0);
      setFinished(false);
    }
    setPlaying((value) => !value);
  }

  useEffect(() => {
    if (!full && !wide) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (event.key === " " && target?.tagName !== "BUTTON") {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key === "ArrowRight") goNext();
      else if (event.key === "ArrowLeft") setStepIndex((index) => Math.max(0, index - 1));
      else if (event.key.toLowerCase() === "f") void toggleFull();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const state: TourState = { ...base, ...live };
  const progress = ((stepIndex + (finished ? 1 : 0)) / lesson.steps.length) * 100;
  const nextLesson = lessons[lessonIndex + 1];

  return (
    <div className={`tour${full ? " is-full" : ""}${wide ? " is-wide" : ""}`} ref={root}>
      <nav className="tour-list" aria-label="Lessons">
        <p className="a-muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
          {done.filter((id) => lessons.some((l) => l.id === id)).length} of {lessons.length} watched
        </p>
        {lessons.map((item, index) => (
          <button key={item.id} type="button" className="tour-item" aria-current={index === lessonIndex ? "true" : undefined} onClick={() => choose(index)}>
            <span className="tour-num" aria-hidden="true">{done.includes(item.id) ? "✓" : index + 1}</span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.minutes} min · {item.steps.length} steps</small>
            </span>
          </button>
        ))}
      </nav>

      <section className="tour-main" aria-label={`Lesson: ${lesson.title}`}>
        <header className="tour-head">
          <div>
            <h2>{lesson.title}</h2>
            <p className="a-muted">{lesson.blurb}</p>
          </div>
          <div className="a-row" style={{ flex: "none" }}>
            <button type="button" className="a-btn a-btn-sm" onClick={() => setWide((value) => !value)} aria-pressed={wide} title="Hide the lesson list and make the screen bigger">
              {wide ? "Show lesson list" : "Wide view"}
            </button>
            <button type="button" className="a-btn a-btn-sm" onClick={toggleFull} aria-pressed={full} title="Use the whole screen (press Esc to leave)">
              <Icon name="expand" size={15} /> {full ? "Leave full screen" : "Full screen"}
            </button>
          </div>
        </header>

        <div className="tour-stage" ref={stage} aria-live="off" data-missing={missing || undefined} data-playing={playing ? "1" : "0"}>
          <div className="tour-screen">{step.screen(state)}</div>
          <svg className="tour-cursor" style={{ left: cursor.x, top: cursor.y, opacity: cursor.visible ? 1 : 0 }} width="22" height="26" viewBox="0 0 22 26" aria-hidden="true">
            <path d="M2 1v20l5.2-4.8 3.4 7.6 3.6-1.6-3.4-7.4H18z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          {cursor.click > 0 && <span key={cursor.click} className="tour-ripple" style={{ left: cursor.x, top: cursor.y }} aria-hidden="true" />}
          {finished && (
            <div className="tour-done" role="status">
              <Icon name="checkCircle" size={40} />
              <h3>You finished “{lesson.title}”</h3>
              <div className="a-row" style={{ justifyContent: "center" }}>
                <button type="button" className="a-btn" onClick={() => { setStepIndex(0); setFinished(false); setPlaying(true); setReplay((n) => n + 1); }}>
                  Watch again
                </button>
                {nextLesson && (
                  <button type="button" className="a-btn a-btn-primary" onClick={() => { choose(lessonIndex + 1); setPlaying(true); }}>
                    Next: {nextLesson.title}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="tour-caption" role="status" aria-live="polite">
          <span className="tour-step">Step {stepIndex + 1} of {lesson.steps.length}</span>
          <p>{step.say}</p>
        </div>

        <div className="tour-bar">
          <div className="tour-seek" role="group" aria-label="Jump to a step">
            <i style={{ width: `${progress}%` }} />
            {lesson.steps.map((_, index) => (
              <button key={index} type="button" aria-label={`Go to step ${index + 1}`} aria-current={index === stepIndex ? "step" : undefined} onClick={() => { setStepIndex(index); setFinished(false); }} style={{ left: `${(index / lesson.steps.length) * 100}%`, width: `${100 / lesson.steps.length}%` }} />
            ))}
          </div>
          <div className="a-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div className="a-row">
              <button type="button" className="a-btn" onClick={() => { setStepIndex(Math.max(0, stepIndex - 1)); setFinished(false); }} disabled={stepIndex === 0}>
                ← Back
              </button>
              <button type="button" className="a-btn a-btn-primary" onClick={play} aria-pressed={playing}>
                {playing ? "❚❚ Pause" : finished ? "▶ Play again" : "▶ Play"}
              </button>
              <button type="button" className="a-btn" onClick={() => (stepIndex < lesson.steps.length - 1 ? (setStepIndex(stepIndex + 1), setFinished(false)) : goNext())}>
                Next →
              </button>
            </div>
            <div className="a-row">
              <span className="a-muted">Speed</span>
              <div className="a-range" role="group" aria-label="Speed">
                {SPEEDS.map((value) => (
                  <button key={value} type="button" aria-pressed={speed === value} aria-current={speed === value ? "page" : undefined} onClick={() => setSpeed(value)}>
                    {value}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
