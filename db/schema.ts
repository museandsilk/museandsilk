import { boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const adminOwners = pgTable("admin_owners", {
  email: text("email").primaryKey(),
  displayName: text("display_name"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  adminEmail: text("admin_email").notNull().references(() => adminOwners.email, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("admin_sessions_email_idx").on(table.adminEmail)]);

export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  ip: text("ip").notNull(),
  success: boolean("success").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("login_attempts_email_idx").on(table.email, table.createdAt)]);

// Checkout email verification: a customer requests a 6-digit code, receives it via Resend, and
// submits it back before the order can be created. `verifiedToken` is only set once the code
// checks out and is what /api/orders actually validates — the code itself never travels past
// verify-otp. `otpHash` is a SHA-256 digest, not a password hash: OTPs are short-lived, single-use,
// and rate-limited, so a fast hash is fine here (see lib/checkout/otp.ts).
export const checkoutVerifications = pgTable("checkout_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  ip: text("ip").notNull(),
  otpHash: text("otp_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  verifiedToken: text("verified_token").unique(),
  verifiedUntil: timestamp("verified_until", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("checkout_verifications_email_idx").on(table.email, table.createdAt)]);

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("admin_audit_entity_idx").on(table.entityType, table.entityId)]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  // Cover image for the homepage "Objects of everyday elegance" cards (a tall 3:4 crop) — all
  // nullable since a category can exist (and did, for every category before this feature) without
  // one; the storefront falls back to a static placeholder in that case.
  imageR2Key: text("image_r2_key"),
  imageAltText: text("image_alt_text"),
  imageContentType: text("image_content_type"),
  imageByteSize: integer("image_byte_size"),
  imageBlurDataUrl: text("image_blur_data_url"),
  imageVariantWidths: jsonb("image_variant_widths").$type<number[]>(),
  // A separate, wide crop for the /collections/[slug] hero banner — that section is short and
  // wide, nothing like the tall card above, so stretching the same crop into both places always
  // looked wrong in one of them. Optional: falls back to the card image above if never set, so
  // every category created before this feature keeps working unchanged.
  heroR2Key: text("hero_r2_key"),
  heroAltText: text("hero_alt_text"),
  heroContentType: text("hero_content_type"),
  heroByteSize: integer("hero_byte_size"),
  heroBlurDataUrl: text("hero_blur_data_url"),
  heroVariantWidths: jsonb("hero_variant_widths").$type<number[]>(),
  ...timestamps,
}, (table) => [index("categories_status_idx").on(table.status)]);

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  typeLabel: text("type_label").notNull(),
  shortDescription: text("short_description"),
  description: text("description"),
  material: text("material"),
  dimensions: text("dimensions"),
  careInstructions: text("care_instructions"),
  // SEO / feed fields
  status: text("status").notNull().default("draft"),
  featured: boolean("featured").notNull().default(false),
  badge: text("badge"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  // Google Merchant Center / Meta catalogue fields
  pattern: text("pattern"),
  primaryColour: text("primary_colour"),
  occasion: text("occasion"),
  style: text("style"),
  countryOfOrigin: text("country_of_origin"),
  gender: text("gender").notNull().default("female"),
  googleProductCategory: text("google_product_category"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("products_category_idx").on(table.categoryId),
  index("products_status_idx").on(table.status),
  index("products_featured_idx").on(table.featured),
]);

export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  color: text("color").notNull(),
  size: text("size"),
  fabric: text("fabric"),
  gtin: text("gtin"),
  price: integer("price").notNull(),
  compareAtPrice: integer("compare_at_price"),
  currency: text("currency").notNull().default("PKR"),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  reservedQuantity: integer("reserved_quantity").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(3),
  isDefault: boolean("is_default").notNull().default(false),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [
  index("variants_product_idx").on(table.productId),
  index("variants_stock_idx").on(table.stockQuantity),
]);

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  r2Key: text("r2_key").notNull().unique(),
  altText: text("alt_text").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  focalPointX: integer("focal_point_x").notNull().default(50),
  focalPointY: integer("focal_point_y").notNull().default(50),
  sortOrder: integer("sort_order").notNull().default(0),
  isPrimary: boolean("is_primary").notNull().default(false),
  status: text("status").notNull().default("active"),
  // Tiny base64 WebP data URL for a blur-up placeholder, and the set of resized WebP variant
  // widths actually generated for this image (see lib/image-processing.ts) — both null for images
  // uploaded before this pipeline existed, or if processing failed and only the original was kept.
  blurDataUrl: text("blur_data_url"),
  variantWidths: jsonb("variant_widths").$type<number[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("images_product_idx").on(table.productId)]);

export const campaignSlides = pgTable("campaign_slides", {
  id: uuid("id").primaryKey().defaultRandom(),
  r2Key: text("r2_key").notNull().unique(),
  altText: text("alt_text").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  eyebrow: text("eyebrow").notNull().default("The first edit · 2026"),
  headline: text("headline").notNull().default("The final layer, considered."),
  body: text("body").notNull().default("Scarves, bandanas and eyewear selected for the way they transform an everyday look."),
  ctaLabel: text("cta_label").notNull().default("Shop the first edit"),
  ctaHref: text("cta_href").notNull().default("/shop"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  blurDataUrl: text("blur_data_url"),
  variantWidths: jsonb("variant_widths").$type<number[]>(),
  // A separately cropped image for narrow (mobile) viewports — set at upload time in the admin
  // panel by cropping the same or a different source photo to a 9:16 target. Optional: falls back
  // to the desktop image above (r2Key) if never set, so existing slides keep working unchanged.
  mobileR2Key: text("mobile_r2_key"),
  mobileContentType: text("mobile_content_type"),
  mobileByteSize: integer("mobile_byte_size"),
  mobileBlurDataUrl: text("mobile_blur_data_url"),
  mobileVariantWidths: jsonb("mobile_variant_widths").$type<number[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("campaign_slides_order_idx").on(table.active, table.sortOrder)]);

export const productCollections = pgTable("product_collections", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  collectionId: uuid("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.productId, table.collectionId] }),
]);

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  quantity: integer("quantity").notNull(),
  reason: text("reason"),
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  actorEmail: text("actor_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("inventory_variant_idx").on(table.variantId)]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  city: text("city").notNull(),
  province: text("province").notNull(),
  address: text("address").notNull(),
  deliveryNotes: text("delivery_notes"),
  subtotal: integer("subtotal").notNull(),
  deliveryCharge: integer("delivery_charge").notNull().default(0),
  discount: integer("discount").notNull().default(0),
  tax: integer("tax").notNull().default(0),
  total: integer("total").notNull(),
  currency: text("currency").notNull().default("PKR"),
  paymentMethod: text("payment_method").notNull(),
  paymentStatus: text("payment_status").notNull().default("pending"),
  orderStatus: text("order_status").notNull().default("pending_confirmation"),
  reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }),
  // Set once a "please confirm your order" reminder has gone out, so the cron job never sends it
  // twice for the same order (see lib/orders.ts's sendReservationReminders).
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  notes: text("notes"),
  // The WhatsApp message ID returned when the order-confirmation template (with Confirm/Cancel
  // buttons) was sent — see lib/whatsapp.ts and app/api/whatsapp/webhook/route.ts. When the
  // customer taps a button, Meta's webhook payload includes `context.id`, the ID of the message
  // being replied to; matching it against this column is how a button tap gets connected back to
  // the specific order, since WhatsApp doesn't otherwise carry our own order ID in the reply.
  whatsappMessageId: text("whatsapp_message_id"),
  // Computed once at order creation from the chosen delivery zone's estimatedDaysMax, and reused
  // as-is afterward (e.g. by the Google Customer Reviews opt-in on the confirmation page) rather
  // than recomputed — the zone's estimate can change later, but the promise already made to this
  // specific customer at checkout shouldn't.
  estimatedDeliveryDate: date("estimated_delivery_date"),
  ...timestamps,
}, (table) => [
  index("orders_phone_idx").on(table.customerPhone),
  index("orders_status_idx").on(table.orderStatus),
  index("orders_created_idx").on(table.createdAt),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  variantName: text("variant_name").notNull(),
  sku: text("sku").notNull(),
  imageUrl: text("image_url"),
  unitPrice: integer("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotal: integer("line_total").notNull(),
}, (table) => [index("order_items_order_idx").on(table.orderId)]);

export const orderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  note: text("note"),
  actorEmail: text("actor_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("order_history_order_idx").on(table.orderId)]);

export const orderIdempotencyKeys = pgTable("order_idempotency_keys", {
  key: text("key").primaryKey(),
  // Nullable: the key is claimed (this row inserted) *before* the order it will belong to exists —
  // see claimIdempotencyKey in lib/idempotency.ts — then filled in once that order is actually
  // created. A row with a null orderId means someone is still in the middle of processing this key.
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentProofs = pgTable("payment_proofs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  status: text("status").notNull().default("pending"),
  reviewNote: text("review_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("payment_proofs_order_idx").on(table.orderId)]);

export const subscribers = pgTable("subscribers", {
  email: text("email").primaryKey(),
  firstName: text("first_name"),
  source: text("source").notNull().default("website"),
  status: text("status").notNull().default("subscribed"),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const siteSettings = pgTable("site_settings", {
  id: text("id").primaryKey().default("store"),
  brandName: text("brand_name").notNull().default("Muse & Silk"),
  whatsappNumber: text("whatsapp_number").notNull().default(""),
  supportPhone: text("support_phone").notNull().default(""),
  supportEmail: text("support_email").notNull().default(""),
  instagramUrl: text("instagram_url").notNull().default(""),
  bankName: text("bank_name").notNull().default(""),
  bankAccountTitle: text("bank_account_title").notNull().default(""),
  bankAccountNumber: text("bank_account_number").notNull().default(""),
  bankIban: text("bank_iban").notNull().default(""),
  metaPixelId: text("meta_pixel_id").notNull().default(""),
  gaMeasurementId: text("ga_measurement_id").notNull().default(""),
  freeDeliveryThreshold: integer("free_delivery_threshold").notNull().default(4000),
  codReservationHours: integer("cod_reservation_hours").notNull().default(6),
  bankReservationHours: integer("bank_reservation_hours").notNull().default(6),
  taxEnabled: boolean("tax_enabled").notNull().default(false),
  currency: text("currency").notNull().default("PKR"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const discountCodes = pgTable("discount_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  description: text("description"),
  type: text("type").notNull(), // "percentage" | "fixed"
  value: integer("value").notNull(), // percentage points (1-100) or fixed PKR amount
  minOrderAmount: integer("min_order_amount").notNull().default(0),
  maxDiscountAmount: integer("max_discount_amount"), // caps a percentage discount, nullable = uncapped
  maxRedemptions: integer("max_redemptions"), // nullable = unlimited
  redemptionCount: integer("redemption_count").notNull().default(0),
  appliesToDelivery: boolean("applies_to_delivery").notNull().default(false),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (table) => [index("discount_codes_active_idx").on(table.active)]);

export const discountRedemptions = pgTable("discount_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  discountCodeId: uuid("discount_code_id").notNull().references(() => discountCodes.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull(),
  amountDiscounted: integer("amount_discounted").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("discount_redemptions_code_idx").on(table.discountCodeId)]);

export const deliveryZones = pgTable("delivery_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  cities: jsonb("cities").notNull().default([]),
  provinces: jsonb("provinces").notNull().default([]),
  deliveryCharge: integer("delivery_charge").notNull(),
  estimatedDaysMin: integer("estimated_days_min").notNull().default(2),
  estimatedDaysMax: integer("estimated_days_max").notNull().default(5),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (table) => [uniqueIndex("delivery_zones_name_idx").on(table.name)]);
