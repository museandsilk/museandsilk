"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { slugify } from "@/lib/slug";
import { processImageClientSide } from "@/lib/client-image-processing";

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

type ImportResult = {
  index: number;
  name: string;
  success: boolean;
  productId?: string;
  imageUrls?: string[];
  imageErrors?: string[];
  variantErrors?: string[];
  error?: string;
};

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
  // resource-limit crashes), so any `imageUrls` are fetched and resized right here in the browser,
  // through the same pipeline as a manual upload, after the products themselves are created.
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);

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

      const withImageErrors: ImportResult[] = [];
      for (const item of result.results) {
        const imageErrors: string[] = [];
        if (item.success && item.productId && item.imageUrls?.length) {
          for (let i = 0; i < item.imageUrls.length; i++) {
            try {
              const fetched = await fetch(item.imageUrls[i]);
              if (!fetched.ok) throw new Error("fetch failed");
              const blob = await fetched.blob();
              const file = new File([blob], `import-${i}.jpg`, { type: blob.type || "image/jpeg" });
              const processed = await processImageClientSide(file);
              if (!processed) throw new Error("processing failed");

              const imageForm = new FormData();
              imageForm.set("productId", item.productId);
              imageForm.set("altText", item.name);
              imageForm.set("isPrimary", i === 0 ? "true" : "false");
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
              imageErrors.push(`Image ${i + 1} (${item.imageUrls[i]}) couldn't be fetched or uploaded — add it manually.`);
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
          <Link href="/" target="_blank">
            View store ↗︎
          </Link>
          <button
            onClick={() => {
              setImportOpen(true);
              setImportText("");
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
                    see lib/ai/seo.ts — so there's nothing to fill in here. Only a read-only
                    preview once the product actually exists and has real generated values. */}
                {draft.id && (draft.seoTitle || draft.name) && (
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
                Paste one product object, or <code>{"{ \"products\": [...] }"}</code> for several. Each product is either{" "}
                <strong>single-variant</strong> (top-level <code>sku</code> + <code>price</code>) or{" "}
                <strong>multi-variant</strong> (a <code>variants</code> array) — not both. <code>category</code> must match an existing
                category name. <code>imageUrls</code> is optional and best-effort: only direct, public, CORS-enabled image links can be
                fetched — anything else will need the photo added manually afterwards.
              </p>

              <label className="field-wide">
                <span>Single-variant example (scarf)</span>
                <textarea
                  rows={3}
                  readOnly
                  value={JSON.stringify(
                    {
                      category: "Scarves",
                      name: "The Nomad Silk Scarf",
                      typeLabel: "Luxury Silk Scarf",
                      shortDescription: "A hand-rolled silk scarf in deep chocolate brown.",
                      material: "100% Mulberry Silk",
                      primaryColour: "Chocolate Brown",
                      status: "draft",
                      sku: "MS-SCF-NOM-BRN",
                      price: 4500,
                      compareAtPrice: 5200,
                      stockQuantity: 10,
                      imageUrls: ["https://example.com/scarf-1.jpg", "https://example.com/scarf-2.jpg"],
                    },
                    null,
                    2,
                  )}
                />
              </label>

              <label className="field-wide">
                <span>Multi-variant example (bandana)</span>
                <textarea
                  rows={3}
                  readOnly
                  value={JSON.stringify(
                    {
                      category: "Bandanas",
                      name: "The Atlas Bandana",
                      typeLabel: "Cotton Bandana",
                      description: "A lightweight cotton bandana in three colorways.",
                      status: "draft",
                      variants: [
                        { name: "Atlas — Rust", color: "Rust", sku: "MS-BND-ATL-RST", price: 1800, stockQuantity: 8, isDefault: true },
                        { name: "Atlas — Indigo", color: "Indigo", sku: "MS-BND-ATL-IND", price: 1800, stockQuantity: 5 },
                      ],
                    },
                    null,
                    2,
                  )}
                />
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
                <button type="button" className="admin-primary" disabled={importBusy || !importText.trim()} onClick={runImport}>
                  {importBusy ? "Importing…" : "Validate & import"}
                </button>
              </footer>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
