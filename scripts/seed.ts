import { eq } from "drizzle-orm";
import { db } from "../db";
import { adminOwners, categories, deliveryZones, products, productVariants, siteSettings } from "../db/schema";
import { hashPassword } from "../lib/auth/password";
import { slugify } from "../lib/slug";

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!email || !password) {
    console.log("Skipping admin seed — ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD not set in .env.local");
    return;
  }
  const [existing] = await db.select().from(adminOwners).limit(1);
  if (existing) {
    console.log(`Admin owner already exists (${existing.email}) — skipping.`);
    return;
  }
  await db.insert(adminOwners).values({
    email: email.toLowerCase(),
    displayName: "Owner",
    passwordHash: await hashPassword(password),
    role: "owner",
  });
  console.log(`Seeded admin owner: ${email}`);
}

async function seedSiteSettings() {
  const [existing] = await db.select().from(siteSettings).where(eq(siteSettings.id, "store")).limit(1);
  if (existing) return;
  await db.insert(siteSettings).values({
    id: "store",
    brandName: "Muse & Silk",
    whatsappNumber: process.env.WHATSAPP_DEFAULT_NUMBER ?? "",
    freeDeliveryThreshold: 4000,
    codReservationHours: 12,
    bankReservationHours: 24,
    taxEnabled: false,
    currency: "PKR",
  });
  console.log("Seeded site_settings.");
}

const CATEGORY_SEED = [
  { name: "Scarves", slug: "scarves", description: "Fluid statements in silk and fine blends." },
  { name: "Bandanas", slug: "bandanas", description: "A smaller gesture with a distinct point of view." },
  { name: "Eyewear", slug: "glasses", description: "Confident frames, softened by considered detail." },
];

async function seedCategories() {
  const ids: Record<string, string> = {};
  for (const cat of CATEGORY_SEED) {
    const [existing] = await db.select().from(categories).where(eq(categories.slug, cat.slug)).limit(1);
    if (existing) {
      ids[cat.slug] = existing.id;
      continue;
    }
    const [inserted] = await db.insert(categories).values(cat).returning({ id: categories.id });
    ids[cat.slug] = inserted.id;
    console.log(`Seeded category: ${cat.name}`);
  }
  return ids;
}

async function seedDeliveryZones() {
  const [existing] = await db.select().from(deliveryZones).limit(1);
  if (existing) return;
  await db.insert(deliveryZones).values([
    { name: "Karachi", cities: ["Karachi"], provinces: ["Sindh"], deliveryCharge: 250, estimatedDaysMin: 1, estimatedDaysMax: 3, sortOrder: 0 },
    { name: "Lahore & Islamabad", cities: ["Lahore", "Islamabad", "Rawalpindi"], provinces: ["Punjab"], deliveryCharge: 300, estimatedDaysMin: 2, estimatedDaysMax: 4, sortOrder: 1 },
    { name: "Rest of Pakistan", cities: [], provinces: ["Punjab", "Sindh", "KPK", "Balochistan", "Gilgit-Baltistan", "Azad Kashmir"], deliveryCharge: 400, estimatedDaysMin: 3, estimatedDaysMax: 6, sortOrder: 2 },
  ]);
  console.log("Seeded delivery zones.");
}

type SampleProduct = {
  category: "scarves" | "bandanas" | "glasses";
  name: string;
  typeLabel: string;
  color: string;
  price: number;
  skuSuffix: string;
  imagePath: string;
};

const SAMPLE_PRODUCTS: SampleProduct[] = [
  { category: "scarves", name: "The Serein Silk Scarf", typeLabel: "Silk scarf", color: "Oxblood", price: 6950, skuSuffix: "SER-OXB", imagePath: "/assets/scarf_1/scarf_1.1.png" },
  { category: "scarves", name: "The Nocturne Silk Scarf", typeLabel: "Silk scarf", color: "Ink", price: 7450, skuSuffix: "NOC-INK", imagePath: "/assets/scarf_2/scarf_2.1.jpeg" },
  { category: "bandanas", name: "The Arc Bandana", typeLabel: "Silk bandana", color: "Porcelain", price: 3850, skuSuffix: "ARC-POR", imagePath: "/assets/scarf_3/scarf_3.1.png" },
];

async function seedProducts(categoryIds: Record<string, string>) {
  for (const item of SAMPLE_PRODUCTS) {
    const slug = slugify(item.name);
    const [existing] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
    if (existing) continue;
    const [product] = await db
      .insert(products)
      .values({
        categoryId: categoryIds[item.category],
        name: item.name,
        slug,
        typeLabel: item.typeLabel,
        shortDescription: `${item.typeLabel} in ${item.color.toLowerCase()}.`,
        description: `A considered ${item.typeLabel.toLowerCase()} in ${item.color.toLowerCase()}, cut for everyday elegance.`,
        material: "Silk twill",
        careInstructions: "Dry clean only. Store flat or gently folded away from direct light.",
        status: "published",
        featured: true,
        publishedAt: new Date(),
      })
      .returning({ id: products.id });
    await db.insert(productVariants).values({
      productId: product.id,
      name: item.color,
      sku: `MS-${item.category === "scarves" ? "SCF" : item.category === "bandanas" ? "BAN" : "EYE"}-${item.skuSuffix}`,
      color: item.color,
      price: item.price,
      stockQuantity: 25,
      isDefault: true,
      status: "active",
    });
    console.log(`Seeded product: ${item.name} (note: image at ${item.imagePath} still needs uploading via admin media pipeline)`);
  }
}

async function main() {
  await seedAdmin();
  await seedSiteSettings();
  const categoryIds = await seedCategories();
  await seedDeliveryZones();
  await seedProducts(categoryIds);
  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
