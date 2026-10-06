import { cookies } from "next/headers";
import { PageHeader } from "../../_ui/ui";
import { TrainingView } from "./training-view";

export const metadata = { title: "Training" };

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ lesson?: string }> }) {
  const { lesson } = await searchParams;
  const lang = (await cookies()).get("adm-lang")?.value === "en" ? "en" : "ur";
  return (
    <>
      <PageHeader
        title="Training"
        intro={lang === "ur" ? "Chotay, khud chalne wale lessons jo dikhate hain kahan click karna hai – ya likha hua guide parhein. Yahan kuch bhi asli dukaan ko nahi badalta." : "Short, self-playing lessons that show exactly where to click – or read the written guide. Nothing here changes your real shop."}
      />
      <TrainingView initialLesson={lesson} initialLang={lang} />
    </>
  );
}
