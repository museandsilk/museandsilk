import { asc } from "drizzle-orm";
import { db } from "@/db";
import { storeLocations } from "@/db/schema";
import { HelpBox } from "../../_ui/client";
import { PageHeader } from "../../_ui/ui";
import { LocationsManager, type LocationRow } from "./locations-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop locations" };

export default async function LocationsPage() {
  const rows = await db.select().from(storeLocations).orderBy(asc(storeLocations.sortOrder), asc(storeLocations.createdAt));
  const locations: LocationRow[] = rows.map((r) => ({ id: r.id, name: r.name, address: r.address, city: r.city, phone: r.phone, hours: r.hours, latitude: r.latitude, longitude: r.longitude, isMain: r.isMain, active: r.active }));
  return (
    <>
      <PageHeader title="Shop locations" intro="The shops customers can visit. They appear at the bottom of your website and on the Contact page." />
      <HelpBox id="locations">
        <ol>
          <li>Press <strong>Add a shop</strong>. Start typing the address in the search box and pick the right line — or just type the address yourself.</li>
          <li>Your <strong>main shop</strong> is shown first. You can add as many other shops as you like.</li>
          <li>Hide a shop with the <strong>Show on website</strong> switch if it is closed for a while.</li>
        </ol>
      </HelpBox>
      <LocationsManager initial={locations} />
    </>
  );
}
