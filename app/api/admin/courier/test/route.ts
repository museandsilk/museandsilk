import { getAdminUser } from "@/lib/auth/admin-auth";
import { testTcsConnection } from "@/lib/tcs";

export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await testTcsConnection());
}
