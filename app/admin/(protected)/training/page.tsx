import { cookies } from "next/headers";
import { PageHeader } from "../../_ui/ui";
import { TrainingView } from "./training-view";
import { isSandbox } from "@/lib/sandbox";

export const metadata = { title: "Training" };

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ lesson?: string }> }) {
  const { lesson } = await searchParams;
  const lang = (await cookies()).get("adm-lang")?.value === "en" ? "en" : "ur";
  // The real admin points to the practice shop (its address and sign-in are set on the Worker once the practice shop exists).
  const practiceUrl = !isSandbox() ? process.env.SANDBOX_URL || "" : "";
  const practiceEmail = process.env.SANDBOX_ADMIN_EMAIL || "practice@nureasmir.com";
  const practicePassword = process.env.SANDBOX_ADMIN_PASSWORD || "";
  return (
    <>
      <PageHeader
        title="Training"
        intro={lang === "ur" ? "Chotay, khud chalne wale lessons jo dikhate hain kahan click karna hai – ya likha hua guide parhein. Yahan kuch bhi asli dukaan ko nahi badalta." : "Short, self-playing lessons that show exactly where to click – or read the written guide. Nothing here changes your real shop."}
      />
      {practiceUrl && (
        <section className="a-card" style={{ marginBottom: 16 }}>
          <div className="a-card-pad" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <strong>{lang === "ur" ? "Practice shop – kar ke seekhein" : "Practice shop – learn by doing"}</strong>
              <div className="a-muted">
                {lang === "ur"
                  ? "Wohi admin, nakli products aur orders ke saath. Koi email, WhatsApp ya TCS nahi jata. Roz clicks ki tay tadad hai, aur “Start again” sab wapas kar deta hai."
                  : "The same admin with pretend products and orders. No email, WhatsApp or TCS is ever sent. A fixed number of clicks a day, and “Start again” puts everything back."}
              </div>
              {practicePassword && (
                <div className="a-muted" style={{ marginTop: 6 }}>
                  {lang === "ur" ? "Sign in:" : "Sign in:"} <code>{practiceEmail}</code> · <code>{practicePassword}</code>
                </div>
              )}
            </div>
            <a className="a-btn a-btn-primary" href={`${practiceUrl}/admin`} target="_blank" rel="noopener noreferrer">
              {lang === "ur" ? "Practice shop kholein" : "Open the practice shop"}
            </a>
          </div>
        </section>
      )}
      <TrainingView initialLesson={lesson} initialLang={lang} />
    </>
  );
}
