"use client";

import { useRouter } from "next/navigation";
import { useLockedAction } from "@/lib/use-locked-action";
import { callApi, useToast } from "../../_ui/client";

export function RefreshStorage() {
  const router = useRouter();
  const toast = useToast();
  const action = useLockedAction();
  return (
    <button
      type="button"
      className="a-btn a-btn-sm"
      disabled={action.pending}
      aria-busy={action.pending}
      onClick={() =>
        action.run(async () => {
          const result = await callApi("/api/developer/storage", "POST");
          if (result.ok) {
            toast("Storage measured.", "good");
            router.refresh();
          } else toast(result.error, "bad");
        })
      }
    >
      {action.pending ? "Measuring…" : "Measure now"}
    </button>
  );
}
