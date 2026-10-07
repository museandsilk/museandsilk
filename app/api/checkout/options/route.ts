import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveryZones, siteSettings } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const [zones, settingsRows] = await Promise.all([
    db
      .select({
        id: deliveryZones.id,
        name: deliveryZones.name,
        deliveryCharge: deliveryZones.deliveryCharge,
        cities: deliveryZones.cities,
        provinces: deliveryZones.provinces,
        estimatedDaysMin: deliveryZones.estimatedDaysMin,
        estimatedDaysMax: deliveryZones.estimatedDaysMax,
      })
      .from(deliveryZones)
      .where(eq(deliveryZones.active, true))
      .orderBy(asc(deliveryZones.sortOrder)),
    db
      .select({
        freeDeliveryThreshold: siteSettings.freeDeliveryThreshold,
        bankDepositEnabled: siteSettings.bankDepositEnabled,
        deliveryMode: siteSettings.deliveryMode,
        flatDeliveryCharge: siteSettings.flatDeliveryCharge,
        whatsappNumber: siteSettings.whatsappNumber,
        bankName: siteSettings.bankName,
        bankAccountTitle: siteSettings.bankAccountTitle,
        bankAccountNumber: siteSettings.bankAccountNumber,
        bankIban: siteSettings.bankIban,
        codReservationHours: siteSettings.codReservationHours,
        bankReservationHours: siteSettings.bankReservationHours,
      })
      .from(siteSettings)
      .where(eq(siteSettings.id, "store"))
      .limit(1),
  ]);

  const row = settingsRows[0] ?? null;
  const settings = row && !row.bankDepositEnabled ? { ...row, bankName: "", bankAccountTitle: "", bankAccountNumber: "", bankIban: "" } : row;

  // Delivery zones / bank details change rarely: let the browser and Cloudflare reuse this briefly.
  return Response.json(
    { zones, settings },
    { headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } },
  );
}
