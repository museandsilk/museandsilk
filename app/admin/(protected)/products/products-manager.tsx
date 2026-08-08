"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { slugify } from "@/lib/slug";
import { processImageClientSide } from "@/lib/client-image-processing";
import { formatDimensions, joinCareInstructions, joinListField, normalizeGender, productImportSchema } from "@/lib/import/product-import-schema";

type Category = { id: string; name: string };

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  typeLabel: string;
  status: string;
  featured: boolean;
  badge: string | null;
  categoryId: string;
  categoryName: string;
  sku: string | null;
  price: number | null;
  available: number | null;
  variantCount: number;
  lowStock: boolean;
  imageId: string | null;
};

type ProductDetail = {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  typeLabel: string;
  shortDescription: string | null;
  description: string | null;
  material: string | null;
  dimensions: string | null;
  careInstructions: string | null;
  status: string;
  featured: boolean;
  badge: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  pattern: string | null;
  primaryColour: string | null;
  occasion: string | null;
  style: string | null;
  countryOfOrigin: string | null;
  gender: string;
  googleProductCategory: string | null;
};

type Variant = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  color: string;
  size: string | null;
  fabric: string | null;
  gtin: string | null;
  price: number;
  compareAtPrice: number | null;
  stockQuantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  isDefault: boolean;
  status: string;
};

type ProductImage = {
  id: string;
  productId: string;
  variantId: string | null;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
  status: string;
};

/** One row of the per-variant quickstart shown after a multi-variant JSON import — pre-filled from
 * the parsed JSON but still fully editable before the product is created. `imageFileName` is only
 * ever a hint (the JSON's `file` value): browsers can't read a local file by name for security
 * reasons, so the admin still has to pick it themselves via the file input below the hint. */
type ImportedVariantDraft = {
  name: string;
  color: string;
  sku: string;
  size?: string;
  fabric?: string;
  gtin?: string;
  price: string;
  compareAtPrice: string;
  stockQuantity: string;
  lowStockThreshold?: string;
  imageFileName?: string;
  imageAlt: string;
};

// Shared with the "Download sample JSON" buttons below — one source of truth for what the example
// structure actually looks like, so the on-screen example and the downloadable file can't drift.
const SINGLE_VARIANT_EXAMPLE = {
  name: "The Nomad Silk Scarf",
  slug: "the-nomad-silk-scarf",
  category: "Scarves",
  typeLabel: "Luxury Silk Scarf",
  visibility: "draft",
  featured: true,
  badge: "New",
  shortDescription: "A luxurious chocolate brown silk scarf with an elegant equestrian-inspired print.",
  description: "Inspired by classic equestrian heritage, this scarf blends rich chocolate brown tones with refined golden accents and intricate chain motifs.",
  material: "Premium Satin Silk",
  dimensions: { length: 90, width: 90, unit: "cm" },
  careInstructions: ["Hand wash with cold water.", "Do not bleach.", "Iron on low heat."],
  primaryColour: "Chocolate Brown",
  attributes: { pattern: "Equestrian Chain & Monogram Print", gender: "Women", countryOfOrigin: "Pakistan" },
  seo: { title: "The Nomad Silk Scarf | Muse & Silk", description: "Premium chocolate brown luxury silk scarf." },
  variants: [
    {
      name: "Chocolate Brown",
      color: "Chocolate Brown",
      sku: "MS-SCF-NOM-BRN",
      price: 3490,
      compareAtPrice: 4490,
      stockQuantity: 25,
      images: [{ file: "nomad-desert.jpg", isPrimary: true, order: 0, alt: "The Nomad Silk Scarf in a desert setting." }],
    },
  ],
};

const MULTI_VARIANT_EXAMPLE = {
  name: "The Atlas Silk Scarf",
  category: "Scarves",
  typeLabel: "Luxury Silk Scarf",
  visibility: "published",
  variants: [
    {
      name: "Chocolate Brown",
      color: "Chocolate Brown",
      sku: "MS-SCF-ATL-BRN",
      price: 3490,
      stockQuantity: 12,
      images: [{ file: "atlas-brown-1.jpg", isPrimary: true, order: 0, alt: "Atlas Silk Scarf in Chocolate Brown." }],
    },
    {
      name: "Emerald Green",
      color: "Emerald Green",
      sku: "MS-SCF-ATL-GRN",
      price: 3490,
      stockQuantity: 8,
      images: [{ file: "atlas-green-1.jpg", isPrimary: true, order: 0, alt: "Atlas Silk Scarf in Emerald Green." }],
    },
  ],
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const emptyDraft: ProductDetail = {
  id: "",
  categoryId: "",
  name: "",
  slug: "",
  typeLabel: "",
  shortDescription: "",
  description: "",
  material: "",
  dimensions: "",
  careInstructions: "",
  status: "draft",
  featured: false,
  badge: "",
  seoTitle: "",
  seoDescription: "",
  pattern: "",
  primaryColour: "",
  occasion: "",
  style: "",
  countryOfOrigin: "",
  gender: "female",
  googleProductCategory: "",
};

export function ProductsManager({ categories }: { categories: Category[] }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [draft, setDraft] = useState<ProductDetail | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [downloadChoiceOpen, setDownloadChoiceOpen] = useState(false);

  // Simplified single-variant creation path — see the "Multi-variant product" checkbox in the
  // create form. Left unchecked (the common case), the admin never has to visit a separate
  // "add variant" step at all: color/name/description are inherited from the product itself, and
  // only the facts that genuinely differ per-listing (SKU, price, stock) are asked for once, right
  // here, then submitted automatically right after the product itself is created.
  const [multiVariant, setMultiVariant] = useState(false);
  const [initialSku, setInitialSku] = useState("");
  const [initialPrice, setInitialPrice] = useState("");
  const [initialCompareAtPrice, setInitialCompareAtPrice] = useState("");
  const [initialStock, setInitialStock] = useState("0");
  const [initialImageFile, setInitialImageFile] = useState<File | null>(null);

  // Populated only when a multi-variant JSON import opened this drawer — one editable draft per
  // variant in the JSON, plus the (optional) photo the admin picks for it, so all of a
  // multi-variant product's variants and photos are captured in this same create step instead of
  // requiring a manual "add variant" round-trip per color afterwards.
  const [importedVariants, setImportedVariants] = useState<ImportedVariantDraft[]>([]);
  const [variantImageFiles, setVariantImageFiles] = useState<(File | null)[]>([]);

  function updateImportedVariant(index: number, patch: Partial<ImportedVariantDraft>) {
    setImportedVariants((current) => current.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)));
  }

  // Bulk JSON import — see lib/import/product-import-schema.ts for the accepted shapes.
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  /** Parses the pasted/uploaded JSON client-side (no server round-trip) and opens the exact same
   * create-product drawer used for a manual add, pre-filled from it, so the admin reviews (and can
   * still edit) everything before it's actually saved. A single-variant product pre-fills the same
   * quickstart SKU/price/stock fields a manual single-variant entry would use; a multi-variant
   * product just checks "Multi-variant product" (matching what an admin would do by hand) — each
   * variant still gets added afterward the normal way, since the create form was never able to
   * represent more than one variant inline. */
  function openFromImport() {
    let payload: unknown;
    try {
      payload = JSON.parse(importText);
    } catch {
      setMessage("That's not valid JSON — check for a missing comma or bracket.");
      return;
    }
    if (payload && typeof payload === "object" && "products" in (payload as Record<string, unknown>)) {
      setMessage('This opens one product at a time — paste a single product object, not a "products" array.');
      return;
    }
    const parsed = productImportSchema.safeParse(payload);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "That JSON doesn't match the expected product structure.");
      return;
    }
    const item = parsed.data;
    const category = categories.find((entry) => entry.name.trim().toLowerCase() === item.category.trim().toLowerCase());
    if (!category) {
      setMessage(`Category "${item.category}" doesn't match an existing category — check spelling.`);
      return;
    }

    setDraft({
      id: "",
      categoryId: category.id,
      name: item.name,
      slug: item.slug ? slugify(item.slug) : slugify(item.name),
      typeLabel: item.typeLabel,
      shortDescription: item.shortDescription ?? "",
      description: item.description ?? "",
      material: item.material ?? "",
      dimensions: formatDimensions(item.dimensions) ?? "",
      careInstructions: joinCareInstructions(item.careInstructions) ?? "",
      status: item.visibility ?? "draft",
      featured: item.featured ?? false,
      badge: item.badge ?? "",
      seoTitle: item.seo?.title ?? "",
      seoDescription: item.seo?.description ?? "",
      pattern: item.attributes?.pattern ?? "",
      primaryColour: item.primaryColour ?? "",
      occasion: joinListField(item.attributes?.occasion) ?? "",
      style: joinListField(item.attributes?.style) ?? "",
      countryOfOrigin: item.attributes?.countryOfOrigin ?? "",
      gender: normalizeGender(item.attributes?.gender),
      googleProductCategory: item.attributes?.googleProductCategory ?? "",
    });
    setSlugTouched(Boolean(item.slug));
    setVariants([]);
    setImages([]);
    setInitialImageFile(null);

    if (item.variants.length === 1) {
      const variant = item.variants[0];
      setMultiVariant(false);
      setInitialSku(variant.sku);
      setInitialPrice(String(variant.price));
      setInitialCompareAtPrice(variant.compareAtPrice != null ? String(variant.compareAtPrice) : "");
      setInitialStock(String(variant.stockQuantity ?? 0));
      setImportedVariants([]);
      setVariantImageFiles([]);
    } else {
      setMultiVariant(true);
      setInitialSku("");
      setInitialPrice("");
      setInitialCompareAtPrice("");
      setInitialStock("0");
      setImportedVariants(
        item.variants.map((variant) => ({
          name: variant.name || variant.color,
          color: variant.color,
          sku: variant.sku,
          size: variant.size,
          fabric: variant.fabric,
          gtin: variant.gtin,
          price: String(variant.price),
          compareAtPrice: variant.compareAtPrice != null ? String(variant.compareAtPrice) : "",
          stockQuantity: String(variant.stockQuantity ?? 0),
          lowStockThreshold: variant.lowStockThreshold != null ? String(variant.lowStockThreshold) : "",
          imageFileName: variant.images?.[0]?.file,
          imageAlt: variant.images?.[0]?.alt || `${item.name} — ${variant.color}`,
        })),
      );
      setVariantImageFiles(item.variants.map(() => null));
    }

    setImportOpen(false);
    setMessage("");
  }

  function loadImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function generateDescription() {
    if (!draft?.name) {
      setMessage("Add a product name first.");
      return;
    }
    setAiBusy(true);
    try {
      const response = await fetch("/api/admin/ai-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          type: draft.typeLabel || undefined,
          color: draft.primaryColour || undefined,
          material: draft.material || undefined,
        }),
      });
      const result = await response.json();
      if (response.ok) {
        setDraft((current) => (current ? { ...current, description: result.description } : current));
      } else {
        setMessage(result.error ?? "Could not generate a description.");
      }
    } catch {
      setMessage("Could not reach the AI service.");
    } finally {
      setAiBusy(false);
    }
  }

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const response = await fetch(`/api/admin/products?${params.toString()}`, { cache: "no-store" });
    if (response.ok) setProducts((await response.json()).products);
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 200);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const published = useMemo(() => products.filter((p) => p.status === "published").length, [products]);
  const lowStockCount = useMemo(() => products.filter((p) => p.lowStock).length, [products]);

  async function openNew() {
    setDraft({ ...emptyDraft, categoryId: categories[0]?.id ?? "" });
    setSlugTouched(false);
    setVariants([]);
    setImages([]);
    setMultiVariant(false);
    setInitialSku("");
    setInitialPrice("");
    setInitialCompareAtPrice("");
    setInitialStock("0");
    setInitialImageFile(null);
    setImportedVariants([]);
    setVariantImageFiles([]);
  }

  async function openEdit(productId: string) {
    const response = await fetch(`/api/admin/products/${productId}`, { cache: "no-store" });
    if (!response.ok) {
      setMessage("Could not load the product.");
      return;
    }
    const data = await response.json();
    setDraft(data.product);
    setSlugTouched(true);
    setVariants(data.variants);
    setImages(data.images);
  }

  function closeDrawer() {
    setDraft(null);
    setVariants([]);
    setImages([]);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy) return;
    const isCreating = !draft.id;

    if (isCreating && !multiVariant && (!initialSku.trim() || !initialPrice)) {
      setMessage("Add a SKU and price (or check “Multi-variant product” to add variants afterwards).");
      return;
    }
    if (isCreating && multiVariant && importedVariants.length > 0 && importedVariants.some((variant) => !variant.sku.trim() || !variant.price)) {
      setMessage("Every variant needs a SKU and price.");
      return;
    }

    setBusy(true);
    setMessage(isCreating ? "Creating product…" : "");
    try {
      const payload = { ...draft };
      const response = await fetch(draft.id ? `/api/admin/products/${draft.id}` : "/api/admin/products", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string; product?: ProductDetail };
      if (!response.ok) {
        setMessage(result.error ?? "The product could not be saved.");
        return;
      }

      if (isCreating && result.product) {
        const newProductId = result.product.id;

        if (initialImageFile) {
          setMessage("Uploading photo…");
          const processed = await processImageClientSide(initialImageFile);
          if (!processed) {
            // Never fall back to uploading the raw picked file — that's exactly what caused the
            // "Worker exceeded resource limits" crash this whole pipeline exists to avoid (a phone
            // photo can be tens of MB). Fail this step cleanly instead; the product itself is
            // already saved, so the admin can just add the photo again from the edit view below.
            setMessage("Product created, but that photo couldn't be processed — try a different file, or add it below.");
          } else {
            const imageForm = new FormData();
            imageForm.set("productId", newProductId);
            imageForm.set("altText", draft.name);
            imageForm.set("isPrimary", "true");
            imageForm.set("width", String(processed.width));
            imageForm.set("height", String(processed.height));
            imageForm.set("blurDataUrl", processed.blurDataUrl);
            imageForm.set("variantWidths", JSON.stringify(processed.variants.map((v) => v.width)));
            for (const variant of processed.variants) {
              imageForm.set(`variant_${variant.width}`, variant.blob, `variant-${variant.width}.webp`);
            }
            const largest = processed.variants[processed.variants.length - 1];
            imageForm.set("file", largest.blob, `product-${largest.width}.webp`);
            const imageResponse = await fetch("/api/admin/images", { method: "POST", body: imageForm });
            if (!imageResponse.ok) setMessage("Product created, but the photo could not be uploaded — add it below.");
          }
        }

        if (!multiVariant) {
          setMessage((current) => (current?.startsWith("Product created, but") ? current : "Adding variant…"));
          const variantResponse = await fetch("/api/admin/variants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId: newProductId,
              name: draft.name,
              sku: initialSku.trim(),
              color: draft.primaryColour || draft.name,
              price: initialPrice,
              compareAtPrice: initialCompareAtPrice || undefined,
              stockQuantity: initialStock || 0,
              isDefault: true,
            }),
          });
          if (!variantResponse.ok) {
            const variantResult = (await variantResponse.json().catch(() => ({}))) as { error?: string };
            setMessage((current) =>
              current?.startsWith("Product created, but")
                ? current
                : `Product created, but ${(variantResult.error ?? "the variant could not be added").toLowerCase()} — add it below.`,
            );
          }
        } else if (importedVariants.length > 0) {
          // Every variant from the imported JSON, in order — each gets its own SKU/price/stock
          // (already reviewed/edited by the admin above) and, if a photo was picked for it, its own
          // image tied via variantId so the storefront can cycle each variant's own picture.
          const problems: string[] = [];
          for (let index = 0; index < importedVariants.length; index++) {
            const variant = importedVariants[index];
            setMessage((current) => (current?.startsWith("Product created, but") ? current : `Adding ${variant.color}…`));
            const variantResponse = await fetch("/api/admin/variants", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                productId: newProductId,
                name: variant.name || variant.color,
                sku: variant.sku.trim(),
                color: variant.color,
                size: variant.size || undefined,
                fabric: variant.fabric || undefined,
                gtin: variant.gtin || undefined,
                price: variant.price,
                compareAtPrice: variant.compareAtPrice || undefined,
                stockQuantity: variant.stockQuantity || 0,
                lowStockThreshold: variant.lowStockThreshold || undefined,
                isDefault: index === 0,
              }),
            });
            const variantResult = (await variantResponse.json().catch(() => ({}))) as { error?: string; variant?: { id: string } };
            if (!variantResponse.ok || !variantResult.variant) {
              problems.push(`${variant.color}: ${(variantResult.error ?? "could not be added").toLowerCase()}`);
              continue;
            }

            const file = variantImageFiles[index];
            if (file) {
              setMessage((current) => (current?.startsWith("Product created, but") ? current : `Uploading photo for ${variant.color}…`));
              const processed = await processImageClientSide(file);
              if (!processed) {
                problems.push(`${variant.color}: photo couldn't be processed`);
              } else {
                const imageForm = new FormData();
                imageForm.set("productId", newProductId);
                imageForm.set("variantId", variantResult.variant.id);
                imageForm.set("altText", variant.imageAlt);
                imageForm.set("isPrimary", index === 0 ? "true" : "false");
                imageForm.set("width", String(processed.width));
                imageForm.set("height", String(processed.height));
                imageForm.set("blurDataUrl", processed.blurDataUrl);
                imageForm.set("variantWidths", JSON.stringify(processed.variants.map((v) => v.width)));
                for (const imgVariant of processed.variants) {
                  imageForm.set(`variant_${imgVariant.width}`, imgVariant.blob, `variant-${imgVariant.width}.webp`);
                }
                const largest = processed.variants[processed.variants.length - 1];
                imageForm.set("file", largest.blob, `product-${largest.width}.webp`);
                const imageResponse = await fetch("/api/admin/images", { method: "POST", body: imageForm });
                if (!imageResponse.ok) problems.push(`${variant.color}: photo could not be uploaded`);
              }
            }
          }
          if (problems.length) {
            setMessage(`Product created, but some variants need attention — ${problems.join("; ")}. Fix these below.`);
          }
        }

        setMessage((current) => (current?.startsWith("Product created, but") ? current : "Product created."));
        await refresh();
        await openEdit(newProductId);
      } else {
        setMessage("Product updated.");
        await refresh();
      }
    } catch (error) {
      console.error("saveProduct failed", error);
      setMessage("Something went wrong saving the product — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function archiveProduct(productId: string) {
    if (!window.confirm("Archive this product? It will be hidden from the storefront but can be republished later.")) return;
    const response = await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
    setMessage(response.ok ? "Product archived." : "Could not archive product.");
    if (response.ok) {
      await refresh();
      if (draft?.id === productId) closeDrawer();
    }
  }

  async function deleteProductPermanently(productId: string) {
    if (
      !window.confirm(
        "Permanently delete this product? This removes its images from storage and cannot be undone. Past orders that included it are not affected.",
      )
    )
      return;
    const response = await fetch(`/api/admin/products/${productId}?permanent=true`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Product permanently deleted." : result.error ?? "Could not delete product.");
    if (response.ok) {
      await refresh();
      if (draft?.id === productId) closeDrawer();
    }
  }

  async function addVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.id || busy) return;
    setBusy(true);
    const currentForm = event.currentTarget;
    try {
      const form = new FormData(currentForm);
      const body = {
        productId: draft.id,
        name: form.get("name"),
        sku: form.get("sku"),
        color: form.get("color"),
        size: form.get("size") || undefined,
        fabric: form.get("fabric") || undefined,
        gtin: form.get("gtin") || undefined,
        price: form.get("price"),
        compareAtPrice: form.get("compareAtPrice") || undefined,
        stockQuantity: form.get("stockQuantity") || 0,
        lowStockThreshold: form.get("lowStockThreshold") || 3,
        isDefault: form.get("isDefault") === "on",
      };
      const response = await fetch("/api/admin/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      setMessage(response.ok ? "Variant added." : result.error ?? "Variant could not be added.");
      if (response.ok) {
        currentForm.reset();
        await openEdit(draft.id);
        await refresh();
      }
    } catch (error) {
      console.error("addVariant failed", error);
      setMessage("Something went wrong adding the variant — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveVariant(event: FormEvent<HTMLFormElement>, variantId: string) {
    event.preventDefault();
    if (!draft?.id) return;
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"),
      sku: form.get("sku"),
      color: form.get("color"),
      size: form.get("size") || undefined,
      fabric: form.get("fabric") || undefined,
      gtin: form.get("gtin") || undefined,
      price: form.get("price"),
      compareAtPrice: form.get("compareAtPrice") || undefined,
      stockQuantity: form.get("stockQuantity"),
      lowStockThreshold: form.get("lowStockThreshold"),
      isDefault: form.get("isDefault") === "on",
      status: form.get("status"),
    };
    const response = await fetch(`/api/admin/variants/${variantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setMessage(response.ok ? "Variant updated." : result.error ?? "Variant could not be updated.");
    if (response.ok) {
      await openEdit(draft.id);
      await refresh();
    }
  }

  async function removeVariant(variantId: string) {
    if (!draft?.id) return;
    if (!window.confirm("Archive this variant?")) return;
    const response = await fetch(`/api/admin/variants/${variantId}`, { method: "DELETE" });
    setMessage(response.ok ? "Variant archived." : "Variant could not be archived.");
    if (response.ok) {
      await openEdit(draft.id);
      await refresh();
    }
  }

  async function uploadImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.id || busy) return;
    setBusy(true);
    setMessage("Processing image…");
    const currentForm = event.currentTarget;
    try {
      const form = new FormData(currentForm);
      form.set("productId", draft.id);

      const file = form.get("file");
      if (!(file instanceof File)) {
        setMessage("Choose an image file first.");
        return;
      }
      const processed = await processImageClientSide(file);
      if (!processed) {
        // Never fall back to uploading the raw picked file — that's exactly what caused the
        // "Worker exceeded resource limits" crash this whole pipeline exists to avoid (a phone photo
        // can be tens of MB). Fail cleanly instead of silently sending the huge original.
        setMessage("That photo couldn't be processed — try a different file (JPEG, PNG or WebP).");
        return;
      }
      form.set("width", String(processed.width));
      form.set("height", String(processed.height));
      form.set("blurDataUrl", processed.blurDataUrl);
      form.set("variantWidths", JSON.stringify(processed.variants.map((v) => v.width)));
      for (const variant of processed.variants) {
        form.set(`variant_${variant.width}`, variant.blob, `variant-${variant.width}.webp`);
      }
      // Replace the raw picked file with the largest generated variant before it ever leaves the
      // browser — phone/camera photos can be tens of MB, and uploading that straight to the Worker
      // (on top of the variants) is what was tripping Cloudflare's per-request resource limit. The
      // largest variant is already full quality (native resolution, capped at 1600px) and
      // WebP-compressed, so nothing is lost — this exact fix is already used for campaign images
      // (see campaign-manager.tsx).
      const largest = processed.variants[processed.variants.length - 1];
      form.set("file", largest.blob, `product-${largest.width}.webp`);

      setMessage("Uploading…");
      const response = await fetch("/api/admin/images", { method: "POST", body: form });
      const result = await response.json();
      setMessage(response.ok ? "Image added to the gallery." : result.error ?? "Image upload failed.");
      if (response.ok) {
        currentForm.reset();
        await openEdit(draft.id);
      }
    } catch (error) {
      // Without this, any hiccup in the openEdit() refetch after a successful upload (a transient
      // network blip, for instance) left `busy` stuck true forever — the button would show the
      // spinner and "Image added to the gallery." indefinitely even though the upload had already
      // succeeded. The finally block below is what actually guarantees the spinner clears.
      console.error("uploadImage failed", error);
      setMessage("Something went wrong after the upload — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function imageAction(imageId: string, action: "primary" | "delete") {
    if (!draft?.id) return;
    const response = await fetch(
      `/api/admin/images/${imageId}`,
      action === "delete"
        ? { method: "DELETE" }
        : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPrimary: true }) },
    );
    setMessage(response.ok ? "Image gallery updated." : "Image could not be updated.");
    if (response.ok) await openEdit(draft.id);
  }

  return (
    <section className="admin-main">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Muse &amp; Silk</p>
          <h1>Products</h1>
        </div>
        <div className="admin-top-actions">
          <Link href="/" target="_blank" rel="noopener noreferrer">
            View store ↗︎
          </Link>
          {downloadChoiceOpen ? (
            <>
              <button
                onClick={() => {
                  downloadJson("product-sample-single-variant.json", SINGLE_VARIANT_EXAMPLE);
                  setDownloadChoiceOpen(false);
                }}
              >
                Single-variant
              </button>
              <button
                onClick={() => {
                  downloadJson("product-sample-multi-variant.json", MULTI_VARIANT_EXAMPLE);
                  setDownloadChoiceOpen(false);
                }}
              >
                Multi-variant
              </button>
              <button onClick={() => setDownloadChoiceOpen(false)}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setDownloadChoiceOpen(true)}>Download sample JSON</button>
          )}
          <button
            onClick={() => {
              setImportOpen(true);
              setImportText("");
            }}
          >
            Import JSON
          </button>
          <button onClick={openNew}>Add product</button>
        </div>
      </header>

      {message && (
        <div className="admin-message" role="status">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}

      <div className="admin-metrics">
        <article>
          <span>Total products</span>
          <strong>{products.length}</strong>
          <small>Matching current filter</small>
        </article>
        <article>
          <span>Published</span>
          <strong>{published}</strong>
          <small>Visible in the store</small>
        </article>
        <article>
          <span>Low stock</span>
          <strong>{lowStockCount}</strong>
          <small>Needs attention</small>
        </article>
      </div>

      <div className="admin-table-card">
        <div className="admin-table-tools">
          <div>
            <h2>All pieces</h2>
            <span>{products.length} records</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["all", "draft", "published", "archived"].map((status) => (
              <button
                key={status}
                className={statusFilter === status ? "active" : ""}
                onClick={() => setStatusFilter(status)}
                type="button"
              >
                {status}
              </button>
            ))}
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or type" />
          </div>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Piece</th>
                <th>SKU / category</th>
                <th>Price</th>
                <th>Available</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="admin-product-cell">
                      <span>
                        {product.imageId ? (
                          <Image src={`/api/media/${product.imageId}`} alt="" fill sizes="52px" />
                        ) : (
                          product.name.slice(0, 1)
                        )}
                      </span>
                      <div>
                        <strong>{product.name}</strong>
                        <small>{product.typeLabel}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>{product.sku ?? "—"}</strong>
                    <small>{product.categoryName}</small>
                  </td>
                  <td>{product.price !== null ? `PKR ${product.price.toLocaleString("en-PK")}` : "—"}</td>
                  <td>
                    <strong className={product.lowStock ? "stock-low" : ""}>{product.available ?? "—"}</strong>
                    <small>{product.variantCount} variant(s)</small>
                  </td>
                  <td>
                    <span className={`status-pill status-${product.status}`}>{product.status}</span>
                    {product.status === "published" && product.variantCount === 0 && (
                      <small className="stock-low" style={{ display: "block", marginTop: 4 }}>
                        Not visible — add a variant
                      </small>
                    )}
                  </td>
                  <td>
                    <button className="edit-link" onClick={() => openEdit(product.id)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!products.length && (
            <div className="admin-empty">
              <span>◇</span>
              <h3>No products yet</h3>
              <p>Add your first piece to begin building the catalog.</p>
              <button onClick={openNew}>Add product</button>
            </div>
          )}
        </div>
      </div>

      {draft && (
        <div
          className="admin-drawer-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDrawer();
          }}
        >
          <aside className="admin-drawer">
            <header>
              <div>
                <p className="eyebrow">{draft.id ? "Edit piece" : "New piece"}</p>
                <h2>{draft.id ? draft.name : "Add to the edit"}</h2>
              </div>
              <button onClick={closeDrawer}>×</button>
            </header>

            <form onSubmit={saveProduct} className="admin-product-form">
              <div className="admin-form-grid">
                <label className="field-wide">
                  <span>Product name</span>
                  <input
                    required
                    value={draft.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setDraft({ ...draft, name, slug: slugTouched ? draft.slug : slugify(name) });
                    }}
                    placeholder="The Serein Silk Scarf"
                  />
                </label>
                <label>
                  <span>URL slug</span>
                  <input
                    required
                    value={draft.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setDraft({ ...draft, slug: event.target.value });
                    }}
                  />
                </label>
                <label>
                  <span>Category</span>
                  <select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Type label</span>
                  <input
                    required
                    value={draft.typeLabel}
                    onChange={(event) => setDraft({ ...draft, typeLabel: event.target.value })}
                    placeholder="Silk scarf"
                  />
                </label>
                <label>
                  <span>Visibility</span>
                  <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label>
                  <span>Badge</span>
                  <input value={draft.badge ?? ""} onChange={(event) => setDraft({ ...draft, badge: event.target.value })} placeholder="New" />
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={draft.featured}
                    onChange={(event) => setDraft({ ...draft, featured: event.target.checked })}
                  />
                  <span>Featured on homepage</span>
                </label>
                <label className="field-wide">
                  <span>Short description</span>
                  <input
                    value={draft.shortDescription ?? ""}
                    onChange={(event) => setDraft({ ...draft, shortDescription: event.target.value })}
                  />
                </label>
                <label className="field-wide">
                  <span className="ai-description-label">
                    Description
                    <button type="button" className="ai-description-button" disabled={aiBusy} onClick={generateDescription}>
                      {aiBusy ? (
                        <span className="busy-label">
                          <span className="spinner" aria-hidden="true" /> Writing…
                        </span>
                      ) : (
                        "✦ Generate with AI"
                      )}
                    </button>
                  </span>
                  <textarea rows={4} value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                </label>
                <label>
                  <span>Material</span>
                  <input value={draft.material ?? ""} onChange={(event) => setDraft({ ...draft, material: event.target.value })} />
                </label>
                <label>
                  <span>Dimensions</span>
                  <input value={draft.dimensions ?? ""} onChange={(event) => setDraft({ ...draft, dimensions: event.target.value })} />
                </label>
                <label className="field-wide">
                  <span>Care instructions</span>
                  <textarea
                    rows={2}
                    value={draft.careInstructions ?? ""}
                    onChange={(event) => setDraft({ ...draft, careInstructions: event.target.value })}
                  />
                </label>
              </div>

              <div className="admin-form-grid">
                <label>
                  <span>Primary colour</span>
                  <input value={draft.primaryColour ?? ""} onChange={(event) => setDraft({ ...draft, primaryColour: event.target.value })} />
                </label>
                {/* SEO title/description are drafted automatically by AI from the fields above —
                    see lib/ai/seo.ts — so there's nothing to fill in here. Shown read-only once
                    the product actually exists with real generated values, or immediately when an
                    import already supplied explicit seo.title/seo.description to review. */}
                {(draft.id || draft.seoTitle) && (draft.seoTitle || draft.name) && (
                  <div className="field-wide" style={{ fontSize: 12, opacity: 0.7 }}>
                    <strong>Search preview:</strong> {draft.seoTitle || draft.name} — {draft.seoDescription || draft.shortDescription || ""}
                  </div>
                )}
              </div>

              <details className="admin-advanced-details">
                <summary>Advanced details (optional)</summary>
                <div className="admin-form-grid">
                  <label>
                    <span>Pattern</span>
                    <input value={draft.pattern ?? ""} onChange={(event) => setDraft({ ...draft, pattern: event.target.value })} />
                  </label>
                  <label>
                    <span>Occasion</span>
                    <input value={draft.occasion ?? ""} onChange={(event) => setDraft({ ...draft, occasion: event.target.value })} />
                  </label>
                  <label>
                    <span>Style</span>
                    <input value={draft.style ?? ""} onChange={(event) => setDraft({ ...draft, style: event.target.value })} />
                  </label>
                  <label>
                    <span>Country of origin</span>
                    <input value={draft.countryOfOrigin ?? ""} onChange={(event) => setDraft({ ...draft, countryOfOrigin: event.target.value })} />
                  </label>
                  <label>
                    <span>Gender</span>
                    <select value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value })}>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="unisex">Unisex</option>
                    </select>
                  </label>
                  <label className="field-wide">
                    <span>Google product category</span>
                    <input
                      value={draft.googleProductCategory ?? ""}
                      onChange={(event) => setDraft({ ...draft, googleProductCategory: event.target.value })}
                    />
                  </label>
                </div>
              </details>

              {!draft.id && (
                <div className="admin-new-product-quickstart">
                  <label className="admin-check">
                    <input type="checkbox" checked={multiVariant} onChange={(event) => setMultiVariant(event.target.checked)} />
                    <span>Multi-variant product (comes in more than one color/size)</span>
                  </label>

                  {!multiVariant && (
                    <div className="admin-form-grid">
                      <label>
                        <span>SKU</span>
                        <input required value={initialSku} onChange={(event) => setInitialSku(event.target.value)} placeholder="MS-SCF-LIL-PUR" />
                      </label>
                      <label>
                        <span>Price (PKR)</span>
                        <input required type="number" min="0" value={initialPrice} onChange={(event) => setInitialPrice(event.target.value)} />
                      </label>
                      <label>
                        <span>Compare-at price</span>
                        <input type="number" min="0" value={initialCompareAtPrice} onChange={(event) => setInitialCompareAtPrice(event.target.value)} />
                      </label>
                      <label>
                        <span>Opening stock</span>
                        <input type="number" min="0" value={initialStock} onChange={(event) => setInitialStock(event.target.value)} />
                      </label>
                    </div>
                  )}

                  {multiVariant && importedVariants.length === 0 && (
                    <p className="admin-hint">Add each color/size as its own variant once the product is created below.</p>
                  )}

                  {multiVariant && importedVariants.length > 0 && (
                    <div className="admin-import-variants">
                      <p className="admin-hint">
                        Every variant from your JSON, ready to review — edit anything that needs it, and add each variant&rsquo;s photo below.
                      </p>
                      {importedVariants.map((variant, index) => (
                        <div className="admin-import-variant-row" key={index}>
                          <strong>{variant.color || `Variant ${index + 1}`}</strong>
                          <div className="admin-form-grid">
                            <label>
                              <span>Variant name</span>
                              <input required value={variant.name} onChange={(event) => updateImportedVariant(index, { name: event.target.value })} />
                            </label>
                            <label>
                              <span>Color</span>
                              <input required value={variant.color} onChange={(event) => updateImportedVariant(index, { color: event.target.value })} />
                            </label>
                            <label>
                              <span>SKU</span>
                              <input required value={variant.sku} onChange={(event) => updateImportedVariant(index, { sku: event.target.value })} />
                            </label>
                            <label>
                              <span>Price (PKR)</span>
                              <input
                                required
                                type="number"
                                min="0"
                                value={variant.price}
                                onChange={(event) => updateImportedVariant(index, { price: event.target.value })}
                              />
                            </label>
                            <label>
                              <span>Compare-at price</span>
                              <input
                                type="number"
                                min="0"
                                value={variant.compareAtPrice}
                                onChange={(event) => updateImportedVariant(index, { compareAtPrice: event.target.value })}
                              />
                            </label>
                            <label>
                              <span>Opening stock</span>
                              <input
                                type="number"
                                min="0"
                                value={variant.stockQuantity}
                                onChange={(event) => updateImportedVariant(index, { stockQuantity: event.target.value })}
                              />
                            </label>
                          </div>
                          <label>
                            <span>Photo for {variant.color || `variant ${index + 1}`}{variant.imageFileName ? ` — expects "${variant.imageFileName}"` : ""}</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(event) =>
                                setVariantImageFiles((current) => {
                                  const next = [...current];
                                  next[index] = event.target.files?.[0] ?? null;
                                  return next;
                                })
                              }
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  )}

                  {!(multiVariant && importedVariants.length > 0) && (
                    <>
                      <label>
                        <span>Product photo</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) => setInitialImageFile(event.target.files?.[0] ?? null)}
                        />
                      </label>
                      <small>Optional here — you can always add or replace photos afterwards.</small>
                    </>
                  )}
                </div>
              )}

              <footer>
                <button type="button" onClick={closeDrawer}>
                  Cancel
                </button>
                <button className="admin-primary" disabled={busy}>
                  {busy ? message || "Saving…" : draft.id ? "Save changes" : "Create product"}
                </button>
              </footer>
            </form>

            {draft.id && (
              <section className="product-operations">
                <div>
                  <p className="eyebrow">Current gallery</p>
                  <div className="asset-grid">
                    {images.map((image) => {
                      const owner = variants.find((v) => v.id === image.variantId);
                      return (
                        <article key={image.id}>
                          <div>
                            <Image src={`/api/media/${image.id}`} alt={image.altText} fill sizes="100px" />
                          </div>
                          <small>{image.altText}</small>
                          <small className="asset-variant-tag">{owner ? owner.color : "Shared (all variants)"}</small>
                          {image.isPrimary ? <strong>Main image</strong> : <button onClick={() => imageAction(image.id, "primary")}>Make main</button>}
                          <button onClick={() => imageAction(image.id, "delete")}>Remove</button>
                        </article>
                      );
                    })}
                  </div>
                </div>
                <form className="admin-media-form" onSubmit={uploadImage}>
                  <div>
                    <p className="eyebrow">Image gallery</p>
                    <h3>Add product photography</h3>
                  </div>
                  <label>
                    <span>Image file</span>
                    <input required type="file" name="file" accept="image/jpeg,image/png,image/webp" />
                  </label>
                  <label>
                    <span>Variant</span>
                    <select name="variantId" defaultValue="">
                      <option value="">Shared (all variants)</option>
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.color}
                          {variant.name && variant.name !== variant.color ? ` — ${variant.name}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Image description (SEO &amp; accessibility)</span>
                    <input required name="altText" defaultValue={`${draft.name}`} />
                  </label>
                  <label>
                    <span>Gallery order</span>
                    <input type="number" min="0" name="sortOrder" defaultValue="0" />
                  </label>
                  <label className="admin-check">
                    <input type="checkbox" name="isPrimary" />
                    <span>Make this the main product image</span>
                  </label>
                  <button disabled={busy}>
                    {busy ? (
                      <span className="busy-label">
                        <span className="spinner spinner-light" aria-hidden="true" /> {message || "Working…"}
                      </span>
                    ) : (
                      "Add image to gallery"
                    )}
                  </button>
                  <small>JPG, PNG or WebP · maximum 10 MB · alt text is required</small>
                </form>

                <div>
                  <p className="eyebrow">All sellable variants</p>
                  {variants.map((variant) => (
                    <form key={variant.id} className="variant-editor" onSubmit={(event) => saveVariant(event, variant.id)}>
                      <div>
                        <strong>{variant.isDefault ? "Default · " : ""}{variant.color}</strong>
                        <small>{variant.reservedQuantity} reserved</small>
                      </div>
                      <input name="color" defaultValue={variant.color} aria-label="Color" />
                      <input name="name" defaultValue={variant.name} aria-label="Variant name" />
                      <input name="sku" defaultValue={variant.sku} aria-label="SKU" />
                      <input name="price" type="number" min="0" defaultValue={variant.price} aria-label="Price" />
                      <input name="compareAtPrice" type="number" min="0" defaultValue={variant.compareAtPrice ?? ""} aria-label="Compare-at price" placeholder="Compare at" />
                      <input name="stockQuantity" type="number" min="0" defaultValue={variant.stockQuantity} aria-label="Stock" />
                      <input name="lowStockThreshold" type="number" min="0" defaultValue={variant.lowStockThreshold} aria-label="Low-stock threshold" />
                      <input name="size" defaultValue={variant.size ?? ""} placeholder="Size" />
                      <input name="fabric" defaultValue={variant.fabric ?? ""} placeholder="Fabric" />
                      <input name="gtin" defaultValue={variant.gtin ?? ""} placeholder="GTIN" />
                      <select name="status" defaultValue={variant.status}>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                      </select>
                      <label className="admin-check">
                        <input type="checkbox" name="isDefault" defaultChecked={variant.isDefault} />
                        <span>Default variant</span>
                      </label>
                      <button>Save variant</button>
                      <button type="button" onClick={() => removeVariant(variant.id)}>
                        Archive
                      </button>
                    </form>
                  ))}
                </div>
                <form className="admin-media-form" onSubmit={addVariant}>
                  <div>
                    <p className="eyebrow">New variant</p>
                    <h3>Add another sellable variant</h3>
                  </div>
                  <div className="admin-form-grid">
                    <label>
                      <span>Variant name</span>
                      <input required name="name" placeholder="Oxblood — 90cm" />
                    </label>
                    <label>
                      <span>Color</span>
                      <input required name="color" />
                    </label>
                    <label>
                      <span>Unique SKU</span>
                      <input required name="sku" />
                    </label>
                    <label>
                      <span>Price (PKR)</span>
                      <input required type="number" min="0" name="price" />
                    </label>
                    <label>
                      <span>Compare-at price</span>
                      <input type="number" min="0" name="compareAtPrice" />
                    </label>
                    <label>
                      <span>Opening stock</span>
                      <input required type="number" min="0" name="stockQuantity" defaultValue={0} />
                    </label>
                    <label>
                      <span>Low-stock alert</span>
                      <input type="number" min="0" name="lowStockThreshold" defaultValue={3} />
                    </label>
                    <label>
                      <span>Size (optional)</span>
                      <input name="size" />
                    </label>
                    <label>
                      <span>Fabric (optional)</span>
                      <input name="fabric" />
                    </label>
                    <label>
                      <span>GTIN (optional)</span>
                      <input name="gtin" />
                    </label>
                    <label className="admin-check">
                      <input type="checkbox" name="isDefault" />
                      <span>Make default variant</span>
                    </label>
                  </div>
                  <button disabled={busy}>Add variant</button>
                </form>

                <div className="admin-top-actions">
                  <button type="button" onClick={() => archiveProduct(draft.id)}>
                    Archive product
                  </button>
                  <button type="button" onClick={() => deleteProductPermanently(draft.id)}>
                    Delete permanently
                  </button>
                </div>
              </section>
            )}
          </aside>
        </div>
      )}

      {importOpen && (
        <div
          className="admin-drawer-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setImportOpen(false);
          }}
        >
          <aside className="admin-drawer">
            <header>
              <div>
                <p className="eyebrow">Bulk import</p>
                <h2>Import products from JSON</h2>
              </div>
              <button onClick={() => setImportOpen(false)}>×</button>
            </header>

            <div className="admin-product-form">
              <p className="admin-hint">
                Paste (or upload) one product object and click &ldquo;Open in Add Product form&rdquo; — it opens the normal create-product
                form pre-filled from the JSON, so you review and save it the same way as any other product. Need the accepted structure?
                Use &ldquo;Download sample JSON&rdquo; on the Products page.
              </p>

              <label className="field-wide">
                <span>Your JSON</span>
                <textarea
                  rows={16}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="Paste product JSON here, or choose a .json file below."
                />
              </label>

              <label>
                <span>Or choose a .json file</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) loadImportFile(file);
                  }}
                />
              </label>

              <footer>
                <button type="button" onClick={() => setImportOpen(false)}>
                  Close
                </button>
                <button type="button" className="admin-primary" disabled={!importText.trim()} onClick={openFromImport}>
                  Open in Add Product form
                </button>
              </footer>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
