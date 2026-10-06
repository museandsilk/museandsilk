"use client";

import { useMemo, useState } from "react";
import { googleSearchUrl, seoChecklist, serpPreview, suggestKeywords, type SeoInput } from "@/lib/seo-keywords";
import { Hint, useToast } from "../../_ui/client";
import { Icon } from "../../_ui/icons";

/**
 * "Be found on Google and AI assistants": the phrases shoppers type, how the page will look in a Google result, and a
 * checklist the owner can tick off while adding the product. Everything updates as they type; nothing is sent anywhere.
 */
export function SeoPanel({ input, seoTitle, seoDescription }: { input: SeoInput; seoTitle?: string | null; seoDescription?: string | null }) {
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => suggestKeywords(input), [input]);
  const checks = useMemo(() => seoChecklist(input), [input]);
  const serp = serpPreview({ name: input.name, shortDescription: input.shortDescription, description: input.description, seoTitle, seoDescription });
  const done = checks.filter((item) => item.ok).length;

  async function copy(phrase: string) {
    try {
      await navigator.clipboard.writeText(phrase);
      toast(`Copied “${phrase}”.`, "good");
    } catch {
      toast("Could not copy. Select the words and copy them yourself.", "bad");
    }
  }

  return (
    <section className="a-card" aria-label="Be found on Google">
      <header className="a-card-head">
        <h2>
          6. Be found on Google and AI assistants{" "}
          <Hint text="These are phrases real shoppers type into Google. Using them naturally in the product name and description helps your product appear when they search. Press “Try on Google” to see what shows today." below />
        </h2>
        <small>
          {done} of {checks.length} checks done
        </small>
      </header>
      <div className="a-card-pad a-stack" style={{ gap: 18 }}>
        <div>
          <p className="a-help" style={{ margin: "0 0 6px" }}>How it may look on Google</p>
          <div style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg)", maxWidth: 620 }}>
            <div style={{ color: "#1a0dab", fontSize: 19, lineHeight: 1.3 }}>{serp.title}</div>
            <div style={{ color: "#188038", fontSize: 13 }}>nureasmir.com › products</div>
            <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>{serp.description}</div>
          </div>
        </div>

        <div>
          <p className="a-help" style={{ margin: "0 0 8px" }}>Checklist</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {checks.map((item) => (
              <li key={item.label} className="a-row" style={{ alignItems: "flex-start", gap: 10 }}>
                <span style={{ color: item.ok ? "var(--done)" : "var(--work)", paddingTop: 1 }}>
                  <Icon name={item.ok ? "checkCircle" : "info"} size={18} />
                </span>
                <span>
                  <strong style={{ fontWeight: item.ok ? 500 : 600 }}>{item.label}</strong>
                  {!item.ok && <small className="a-muted" style={{ display: "block" }}>{item.tip}</small>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {groups.length === 0 ? (
          <p className="a-muted">Type the product name and what it is, and search phrases appear here.</p>
        ) : (
          groups.map((group) => (
            <div key={group.title}>
              <p style={{ margin: "0 0 2px" }}><strong>{group.title}</strong></p>
              <p className="a-help" style={{ margin: "0 0 8px" }}>{group.why}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {group.phrases.map((phrase) => (
                  <span key={phrase} className="a-row" style={{ gap: 0, border: "1px solid var(--line)", borderRadius: 999, background: "var(--surface)", overflow: "hidden" }}>
                    <button type="button" className="a-btn a-btn-sm a-btn-quiet" style={{ borderRadius: 0 }} onClick={() => copy(phrase)} aria-expanded={open === phrase} onFocus={() => setOpen(phrase)} onBlur={() => setOpen(null)} title="Copy this phrase">
                      {phrase}
                    </button>
                    <a className="a-btn a-btn-sm a-btn-quiet" style={{ borderRadius: 0, borderLeft: "1px solid var(--line)" }} href={googleSearchUrl(phrase)} target="_blank" rel="noopener noreferrer" title="Open Google with this phrase (Pakistan) to see who is shown today" aria-label={`Try “${phrase}” on Google`}>
                      <Icon name="external" size={14} /> Try on Google
                    </a>
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
