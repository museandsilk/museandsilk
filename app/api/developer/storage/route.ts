import { getAdminUser } from "@/lib/auth/admin-auth";
import { refreshStorageStats } from "@/lib/storage-stats";

export const dynamic = "force-dynamic";

/** Developer-only: measure how full the two picture stores are right now. */
export async function POST() {
  const user = await getAdminUser();
  if (!user || user.role !== "developer") return Response.json({ error: "Not allowed." }, { status: 403 });
  const readings = await refreshStorageStats();
  return Response.json({ readings });
}
