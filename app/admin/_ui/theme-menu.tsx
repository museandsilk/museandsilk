"use client";

import { useState } from "react";
import { Icon } from "./icons";

type Theme = "auto" | "light" | "night";
type TextSize = "normal" | "large";

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** Comfort controls for long days: light / night colours and larger text. Remembered in cookies so the
 * server renders the right look from the first byte (no flash). */
export function ThemeMenu({ initialTheme, initialText }: { initialTheme: Theme; initialText: TextSize }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [text, setText] = useState<TextSize>(initialText);

  function apply(nextTheme: Theme, nextText: TextSize) {
    const root = document.querySelector<HTMLElement>(".adm");
    if (root) {
      root.dataset.theme = nextTheme;
      root.dataset.text = nextText;
    }
    writeCookie("adm-theme", nextTheme);
    writeCookie("adm-text", nextText);
  }

  const order: Theme[] = ["light", "night", "auto"];
  const label = theme === "light" ? "Light colours" : theme === "night" ? "Night colours (easier on the eyes in the dark)" : "Colours follow your computer";

  return (
    <>
      <button
        type="button"
        className="a-icon-btn"
        title={`${label}. Click to change.`}
        aria-label={`${label}. Click to change.`}
        onClick={() => {
          const next = order[(order.indexOf(theme) + 1) % order.length];
          setTheme(next);
          apply(next, text);
        }}
      >
        <Icon name={theme === "night" ? "moon" : "sun"} />
        {theme === "auto" && <span className="sr-only">auto</span>}
      </button>
      <button
        type="button"
        className="a-icon-btn"
        title={text === "large" ? "Text is large. Click for normal size." : "Make the text bigger"}
        aria-label={text === "large" ? "Text is large. Click for normal size." : "Make the text bigger"}
        aria-pressed={text === "large"}
        style={{ fontWeight: 700, fontSize: text === "large" ? 19 : 15 }}
        onClick={() => {
          const next = text === "large" ? "normal" : "large";
          setText(next);
          apply(theme, next);
        }}
      >
        A<span style={{ fontSize: "0.7em" }}>{text === "large" ? "−" : "+"}</span>
      </button>
    </>
  );
}
