import { getAdminUser } from "@/lib/auth/admin-auth";
import { isSandbox, resetToBaseline } from "@/lib/sandbox";

export const dynamic = "force-dynamic";

/** Practice shop only: puts every product, order and setting back to the starting data. Does not give back today's used hits. */
export async function POST() {
  if (!isSandbox()) return Response.json({ error: "This only exists on the practice shop." }, { status: 404 });
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { tables } = await resetToBaseline();
    return Response.json({ ok: true, tables });
  } catch (error) {
    console.error("sandbox reset failed", error);
    return Response.json({ error: "The practice data could not be put back. Please try again in a minute." }, { status: 500 });
  }
}
