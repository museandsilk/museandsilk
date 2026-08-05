"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { slugify } from "@/lib/slug";
import { processImageClientSide } from "@/lib/client-image-processing";
import {
  formatDimensions,
  joinCareInstructions,
  joinListField,
  normalizeGender,
  productImportSchema,
  type ProductImportVariant,
} from "@/lib/import/product-import-schema";

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
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
  status: string;
};

type ImportImageJob = { file: string; isPrimary: boolean; order: number; alt: string };

type ImportResult = {
  index: number;
  name: string;
  success: boolean;
  productId?: string;
  images?: ImportImageJob[];
  imageErrors?: string[];
  variantErrors?: string[];
  error?: string;
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

  // Bulk JSON import — see lib/import/product-import-schema.ts for the accepted shapes. Image
  // processing/resizing never happens on the server (that's what caused the earlier Worker
  // resource-limit crashes): each product's `variants[].images[].file` is just a plain filename,
  // matched here against whatever photo files the admin picks alongside the JSON, then processed
  // through the same client-side pipeline as a manual upload before ever leaving the browser.
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importImageFiles, setImportImageFiles] = useState<File[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);

  // Set once "Open in Add Product form" parses valid JSON — see openFromImport() below. When
  // non-null, saveProduct()'s create branch creates these variants (and their images) itself
  // instead of using the quickstart single-variant fields, right after the admin reviews the
  // pre-filled form and clicks "Create product" themselves.
  const [pendingImportVariants, setPendingImportVariants] = useState<ProductImportVariant[] | null>(null);

  /** Parses the pasted/uploaded JSON client-side (no server round-trip) and opens the normal
   * create-product drawer pre-filled from it, for the admin to review before saving — this is the
   * primary import path. The direct bulk-create button further down stays available for genuine
   * multi-product batches, which don't map onto a single form. */
  function openFromImport() {
    let payload: unknown;
    try {
      payload = JSON.parse(importText);
    } catch {
      setMessage("That's not valid JSON — check for a missing comma or bracket.");
      return;
    }
    if (payload && typeof payload === "object" && "products" in (payload as Record<string, unknown>)) {
      setMessage('This opens one product at a time — paste a single product object, not a "products" array. Use "Create all now" below for a batch.');
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
    setMultiVariant(true); // hides the quickstart SKU/price fields — pendingImportVariants drives creation instead
    setInitialSku("");
    setInitialPrice("");
    setInitialCompareAtPrice("");
    setInitialStock("0");
    setInitialImageFile(null);
    setPendingImportVariants(item.variants);
    setImportOpen(false);
    setMessage("");
  }

  async function runImport() {
    if (importBusy) return;
    let payload: unknown;
    try {
      payload = JSON.parse(importText);
    } catch {
      setMessage("That's not valid JSON — check for a missing comma or bracket.");
      return;
    }

    setImportBusy(true);
    setImportResults([]);
    try {
      const response = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string; results?: ImportResult[] };
      if (!response.ok || !result.results) {
        setMessage(result.error ?? "Import failed.");
        return;
      }

      setImportResults(result.results);

      const filesByName = new Map(importImageFiles.map((file) => [file.name, file]));
      const withImageErrors: ImportResult[] = [];
      for (const item of result.results) {
        const imageErrors: string[] = [];
        if (item.success && item.productId && item.images?.length) {
          const sorted = [...item.images].sort((a, b) => a.order - b.order);
          for (const image of sorted) {
            const file = filesByName.get(image.file);
            if (!file) {
              imageErrors.push(`"${image.file}" wasn't among the photos you selected — add it manually.`);
              continue;
            }
            try {
              const processed = await processImageClientSide(file);
              if (!processed) throw new Error("processing failed");

              const imageForm = new FormData();
              imageForm.set("productId", item.productId);
              imageForm.set("altText", image.alt);
              imageForm.set("isPrimary", image.isPrimary ? "true" : "false");
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
              if (!imageResponse.ok) throw new Error("upload failed");
            } catch {
              imageErrors.push(`"${image.file}" couldn't be processed or uploaded — add it manually.`);
            }
          }
        }
        withImageErrors.push(imageErrors.length ? { ...item, imageErrors } : item);
      }
      setImportResults(withImageErrors);
      await refresh();
    } catch (error) {
      console.error("runImport failed", error);
      setMessage("Something went wrong during import — check your connection and try again.");
    } finally {
      setImportBusy(false);
    }
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
    setPendingImportVariants(null);
    setImportImageFiles([]);
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
    setPendingImportVariants(null);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy) return;
    const isCreating = !draft.id;

    if (isCreating && !pendingImportVariants && !multiVariant && (!initialSku.trim() || !initialPrice)) {
      setMessage("Add a SKU and price (or check “Multi-variant product” to add variants afterwards).");
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

        if (pendingImportVariants) {
          setMessage("Adding imported variant(s)…");
          const filesByName = new Map(importImageFiles.map((file) => [file.name, file]));
          const variantErrors: string[] = [];
          const flattenedImages: { file: string; isPrimary: boolean; order: number; alt: string }[] = [];

          for (let variantIndex = 0; variantIndex < pendingImportVariants.length; variantIndex++) {
            const v = pendingImportVariants[variantIndex];
            const variantResponse = await fetch("/api/admin/variants", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                productId: newProductId,
                name: v.name || draft.name,
                sku: v.sku,
                color: v.color,
                size: v.size,
                fabric: v.fabric,
                gtin: v.gtin,
                price: v.price,
                compareAtPrice: v.compareAtPrice,
                stockQuantity: v.stockQuantity ?? 0,
                lowStockThreshold: v.lowStockThreshold,
                isDefault: v.isDefault ?? variantIndex === 0,
              }),
            });
            if (!variantResponse.ok) {
              const variantResult = (await variantResponse.json().catch(() => ({}))) as { error?: string };
              variantErrors.push(`${v.color}: ${variantResult.error ?? "could not be added"}`);
            }
            // Flattened into one shared gallery, same as the direct bulk-import path — see
            // app/api/admin/products/import/route.ts for why (no per-variant gallery yet).
            for (const image of v.images ?? []) {
              flattenedImages.push({
                file: image.file,
                isPrimary: Boolean(image.isPrimary),
                order: variantIndex * 100 + (image.order ?? 0),
                alt: image.alt || `${draft.name} — ${v.color}`,
              });
            }
          }

          // Exactly one image across the whole set should end up primary — see the matching
          // comment in the bulk-import route for why naively forwarding each variant's own
          // isPrimary:true would leave whichever uploads last as the winner instead.
          flattenedImages.sort((a, b) => a.order - b.order);
          const explicitPrimaryIndex = flattenedImages.findIndex((image) => image.isPrimary);
          const primaryIndex = explicitPrimaryIndex === -1 ? 0 : explicitPrimaryIndex;
          flattenedImages.forEach((image, i) => {
            image.isPrimary = i === primaryIndex;
          });

          const imageErrors: string[] = [];
          for (const image of flattenedImages) {
            const file = filesByName.get(image.file);
            if (!file) {
              imageErrors.push(`"${image.file}" wasn't among the photos you selected — add it manually.`);
              continue;
            }
            try {
              const processed = await processImageClientSide(file);
              if (!processed) throw new Error("processing failed");
              const imageForm = new FormData();
              imageForm.set("productId", newProductId);
              imageForm.set("altText", image.alt);
              imageForm.set("isPrimary", image.isPrimary ? "true" : "false");
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
              if (!imageResponse.ok) throw new Error("upload failed");
            } catch {
              imageErrors.push(`"${image.file}" couldn't be processed or uploaded — add it manually.`);
            }
          }

          const problems = [...variantErrors, ...imageErrors];
          setMessage(problems.length ? `Product created, but: ${problems.join("; ")} — fix these below.` : "Product created with imported variant(s).");
          setPendingImportVariants(null);
          setImportImageFiles([]);
        } else {
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
          }

          setMessage((current) => (current?.startsWith("Product created, but") ? current : "Product created."));
        }

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
          <Link href="/" target="_blank">
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
              setImportImageFiles([]);
              setImportResults([]);
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
                  {pendingImportVariants ? (
                    <div>
                      <p className="admin-hint">
                        Imported {pendingImportVariants.length} variant{pendingImportVariants.length > 1 ? "s" : ""} from JSON — created
                        automatically right after you click &ldquo;Create product&rdquo; below.
                      </p>
                      <ul className="admin-import-variant-list">
                        {pendingImportVariants.map((variant, index) => (
                          <li key={index}>
                            <strong>{variant.color}</strong> · {variant.sku} · PKR {variant.price.toLocaleString("en-PK")}
                            {variant.images?.length ? ` · ${variant.images.length} photo${variant.images.length > 1 ? "s" : ""}` : ""}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => {
                          setPendingImportVariants(null);
                          setMultiVariant(false);
                        }}
                      >
                        Discard imported variants, enter details manually instead
                      </button>
                    </div>
                  ) : (
                    <>
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
                      {multiVariant && <p className="admin-hint">Add each color/size as its own variant once the product is created below.</p>}

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
                    {images.map((image) => (
                      <article key={image.id}>
                        <div>
                          <Image src={`/api/media/${image.id}`} alt={image.altText} fill sizes="100px" />
                        </div>
                        <small>{image.altText}</small>
                        {image.isPrimary ? <strong>Main image</strong> : <button onClick={() => imageAction(image.id, "primary")}>Make main</button>}
                        <button onClick={() => imageAction(image.id, "delete")}>Remove</button>
                      </article>
                    ))}
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
            if (event.target === event.currentTarget && !importBusy) setImportOpen(false);
          }}
        >
          <aside className="admin-drawer">
            <header>
              <div>
                <p className="eyebrow">Bulk import</p>
                <h2>Import products from JSON</h2>
              </div>
              <button onClick={() => !importBusy && setImportOpen(false)}>×</button>
            </header>

            <div className="admin-product-form">
              <p className="admin-hint">
                Paste (or upload) <strong>one product object</strong> and click &ldquo;Open in Add Product form&rdquo; below — it opens the
                normal create-product drawer pre-filled from the JSON, so you can review everything before it&apos;s actually saved. Every
                product has a <code>variants</code> array (min 1) — single-variant is just one entry. <code>category</code> must match an
                existing category name. <code>variants[].images[].file</code> is a plain filename — pick the matching photo files below and
                they&apos;ll be matched by name, processed, and uploaded automatically once you save. <code>seo.title</code>/
                <code>seo.description</code> are optional; when omitted, SEO copy is drafted automatically instead. For a genuine batch of
                several products at once (<code>{"{ \"products\": [...] }"}</code>), use &ldquo;Create all now&rdquo; instead — that path
                saves everything immediately, without a review step.
              </p>

              <label className="field-wide">
                <span className="ai-description-label">
                  Single-variant example (scarf)
                  <button type="button" className="ai-description-button" onClick={() => downloadJson("product-sample-single-variant.json", SINGLE_VARIANT_EXAMPLE)}>
                    ↓ Download
                  </button>
                </span>
                <textarea rows={4} readOnly value={JSON.stringify(SINGLE_VARIANT_EXAMPLE, null, 2)} />
              </label>

              <label className="field-wide">
                <span className="ai-description-label">
                  Multi-variant example (colorways)
                  <button type="button" className="ai-description-button" onClick={() => downloadJson("product-sample-multi-variant.json", MULTI_VARIANT_EXAMPLE)}>
                    ↓ Download
                  </button>
                </span>
                <textarea rows={4} readOnly value={JSON.stringify(MULTI_VARIANT_EXAMPLE, null, 2)} />
              </label>

              <label className="field-wide">
                <span>Your JSON</span>
                <textarea
                  rows={12}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="Paste product JSON here, or upload a .json file below."
                />
              </label>

              <label>
                <span>Or upload a .json file</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) loadImportFile(file);
                  }}
                />
              </label>

              <label>
                <span>Product photos (matched to variants[].images[].file by filename)</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setImportImageFiles(Array.from(event.target.files ?? []))}
                />
                {importImageFiles.length > 0 && <small className="admin-hint">{importImageFiles.length} photo(s) selected.</small>}
              </label>

              {importResults.length > 0 && (
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResults.map((result) => (
                        <tr key={result.index}>
                          <td>{result.name}</td>
                          <td>
                            {result.success ? (
                              <>
                                <span className="status-pill status-published">created</span>
                                {result.variantErrors?.map((err, i) => (
                                  <small key={i} className="stock-low" style={{ display: "block" }}>
                                    {err}
                                  </small>
                                ))}
                                {result.imageErrors?.map((err, i) => (
                                  <small key={i} className="stock-low" style={{ display: "block" }}>
                                    {err}
                                  </small>
                                ))}
                              </>
                            ) : (
                              <span className="status-pill status-archived">{result.error}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <footer>
                <button type="button" onClick={() => setImportOpen(false)} disabled={importBusy}>
                  Close
                </button>
                <button type="button" disabled={importBusy || !importText.trim()} onClick={runImport}>
                  {importBusy ? "Importing…" : "Create all now (skip review)"}
                </button>
                <button type="button" className="admin-primary" disabled={importBusy || !importText.trim()} onClick={openFromImport}>
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
