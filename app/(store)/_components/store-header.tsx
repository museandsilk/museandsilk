import { getActiveCategories, getPublicSettings } from "@/lib/commerce";
import { HeaderClient } from "./header-client";

/** Server wrapper: feeds the (client) header the live category list and shipping threshold, so the
 * menu always reflects what's configured in the admin panel. The header is the same
 * white bar on every page. */
export async function StoreHeader() {
  const [categories, settings] = await Promise.all([getActiveCategories(), getPublicSettings()]);
  return (
    <HeaderClient
      categories={categories.map((category) => ({ name: category.name, slug: category.slug }))}
      freeDeliveryThreshold={settings.freeDeliveryThreshold || null}
      whatsappNumber={settings.whatsappNumber}
    />
  );
}
