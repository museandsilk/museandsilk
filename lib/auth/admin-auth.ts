import { redirect } from "next/navigation";
import { getSessionAdmin, type SessionAdmin } from "./session";

export async function getAdminUser(): Promise<SessionAdmin | null> {
  return getSessionAdmin();
}

export async function requireAdminUser(returnTo = "/admin"): Promise<SessionAdmin> {
  const user = await getSessionAdmin();
  if (!user) redirect(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`);
  return user;
}
