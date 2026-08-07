"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    } catch (error) {
      console.error("logout failed", error);
      setBusy(false);
    }
  }

  return (
    <div className="admin-top-actions">
      <button type="button" onClick={logout} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
