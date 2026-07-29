import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { cleanPhone } from "@/lib/slug";
import { auditLogEntry } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  brandName: z.string().min(1).optional(),
  whatsappNumber: z.string().optional(),
  supportPhone: z.string().optional(),
  supportEmail: z.string().optional(),
  instagramUrl: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountTitle: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIban: z.string().optional(),
  metaPixelId: z.string().optional(),
  gaMeasurementId: z.string().optional(),
  freeDeliveryThreshold: z.coerce.number().int().min(0).optional(),
  codReservationHours: z.coerce.number().int().min(1).optional(),
  bankReservationHours: z.coerce.number().int().min(1).optional(),
  taxEnabled: z.boolean().optional(),
});

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.id, "store")).limit(1);
  return Response.json({ settings: row ?? null });
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid settings payload." }, { status: 400 });
  const data = parsed.data;

  const values = {
    ...(data.brandName !== undefined ? { brandName: data.brandName } : {}),
    ...(data.whatsappNumber !== undefined ? { whatsappNumber: cleanPhone(data.whatsappNumber) } : {}),
    ...(data.supportPhone !== undefined ? { supportPhone: cleanPhone(data.supportPhone) } : {}),
    ...(data.supportEmail !== undefined ? { supportEmail: data.supportEmail } : {}),
    ...(data.instagramUrl !== undefined ? { instagramUrl: data.instagramUrl } : {}),
    ...(data.bankName !== undefined ? { bankName: data.bankName } : {}),
    ...(data.bankAccountTitle !== undefined ? { bankAccountTitle: data.bankAccountTitle } : {}),
    ...(data.bankAccountNumber !== undefined ? { bankAccountNumber: data.bankAccountNumber } : {}),
    ...(data.bankIban !== undefined ? { bankIban: data.bankIban } : {}),
    ...(data.metaPixelId !== undefined ? { metaPixelId: data.metaPixelId } : {}),
    ...(data.gaMeasurementId !== undefined ? { gaMeasurementId: data.gaMeasurementId } : {}),
    ...(data.freeDeliveryThreshold !== undefined ? { freeDeliveryThreshold: data.freeDeliveryThreshold } : {}),
    ...(data.codReservationHours !== undefined ? { codReservationHours: data.codReservationHours } : {}),
    ...(data.bankReservationHours !== undefined ? { bankReservationHours: data.bankReservationHours } : {}),
    ...(data.taxEnabled !== undefined ? { taxEnabled: data.taxEnabled } : {}),
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(siteSettings)
    .values({ id: "store", ...values })
    .onConflictDoUpdate({ target: siteSettings.id, set: values })
    .returning();

  await auditLogEntry({ actorEmail: admin.email, action: "settings.update", entityType: "site-settings", entityId: "store", detail: data });

  return Response.json({ settings: row });
}
