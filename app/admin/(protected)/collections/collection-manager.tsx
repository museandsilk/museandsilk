"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { processImageClientSide } from "@/lib/client-image-processing";

type Product = { id: string; name: string; slug: string; status: string };
type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  sortOrder: number;
  imageUrl: string | null;
};
type Collection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  sortOrder: number;
  productCount: number;
};
type Assignment = { collectionId: string; productId: string };

export function CollectionManager({ products }: { products: Product[] }) {
  const [tab, setTab] = useState<"collections" | "categories">("collections");
  const [categories, setCategories] = useState<Category[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<Collection | null>(null);
  const [message, setMessage] = useState("");
  const [imageBusyId, setImageBusyId] = useState<string | null>(null);

  const refreshCategories = useCallback(async () => {
    const response = await fetch("/api/admin/categories", { cache: "no-store" });
    if (response.ok) setCategories((await response.json()).categories);
  }, []);
  const refreshCollections = useCallback(async () => {
    const response = await fetch("/api/admin/collections", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setCollections(data.collections);
      setAssignments(data.assignments);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshCategories();
      void refreshCollections();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshCategories, refreshCollections]);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setMessage(response.ok ? "Category created." : result.error ?? "Category could not be created.");
    if (response.ok) {
      event.currentTarget.reset();
      await refreshCategories();
    }
  }

  async function uploadCategoryImage(category: Category, file: File) {
    setImageBusyId(category.id);
    setMessage("Processing image…");
    try {
      const processed = await processImageClientSide(file);
      if (!processed) {
        setMessage("That photo couldn't be processed — try a different file (JPEG, PNG or WebP).");
        return;
      }
      const form = new FormData();
      form.set("altText", category.name);
      form.set("blurDataUrl", processed.blurDataUrl);
      form.set("variantWidths", JSON.stringify(processed.variants.map((v) => v.width)));
      for (const variant of processed.variants) {
        form.set(`variant_${variant.width}`, variant.blob, `variant-${variant.width}.webp`);
      }
      const largest = processed.variants[processed.variants.length - 1];
      form.set("file", largest.blob, `category-${largest.width}.webp`);

      setMessage("Uploading…");
      const response = await fetch(`/api/admin/categories/${category.id}/image`, { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Category image updated." : (result.error ?? "Image upload failed."));
      if (response.ok) await refreshCategories();
    } catch (error) {
      console.error("uploadCategoryImage failed", error);
      setMessage("Something went wrong uploading the image — check your connection and try again.");
    } finally {
      setImageBusyId(null);
    }
  }

  async function removeCategoryImage(category: Category) {
    if (!window.confirm(`Remove the cover photo for "${category.name}"?`)) return;
    setImageBusyId(category.id);
    try {
      const response = await fetch(`/api/admin/categories/${category.id}/image`, { method: "DELETE" });
      setMessage(response.ok ? "Category image removed." : "Image could not be removed.");
      if (response.ok) await refreshCategories();
    } finally {
      setImageBusyId(null);
    }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/admin/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(response.ok ? "Category updated." : "Category could not be updated.");
    if (response.ok) await refreshCategories();
  }

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/admin/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setMessage(response.ok ? "Collection created." : result.error ?? "Collection could not be created.");
    if (response.ok) {
      event.currentTarget.reset();
      await refreshCollections();
    }
  }

  async function saveCollectionMeta(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/admin/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(response.ok ? "Collection updated." : "Collection could not be updated.");
    if (response.ok) await refreshCollections();
  }

  async function saveProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const productIds = new FormData(event.currentTarget).getAll("productId");
    const response = await fetch(`/api/admin/collections/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds }),
    });
    setMessage(response.ok ? "Collection products updated." : "Collection could not be updated.");
    if (response.ok) await refreshCollections();
  }

  return (
    <section className="admin-main">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Muse &amp; Silk</p>
          <h1>Categories &amp; Collections</h1>
        </div>
        <div className="admin-top-actions">
          <Link href="/admin/products">← Products</Link>
          <button className={tab === "collections" ? "active" : ""} onClick={() => setTab("collections")}>
            Collections
          </button>
          <button className={tab === "categories" ? "active" : ""} onClick={() => setTab("categories")}>
            Categories
          </button>
        </div>
      </header>

      {message && (
        <div className="admin-message" role="status">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}

      {tab === "categories" ? (
        <div className="collection-manager">
          <section>
            <div className="admin-table-card">
              <div className="admin-table-tools">
                <div>
                  <h2>Categories</h2>
                  <span>{categories.length} categories</span>
                </div>
              </div>
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Photo</th>
                      <th>Name</th>
                      <th>Slug</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th>Order</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category) => (
                      <tr key={category.id}>
                        <td>
                          <div className="category-photo-cell">
                            <span className="category-photo-preview">
                              {category.imageUrl ? (
                                <Image src={category.imageUrl} alt="" fill sizes="60px" />
                              ) : (
                                <i aria-hidden="true">◇</i>
                              )}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={imageBusyId === category.id}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (file) void uploadCategoryImage(category, file);
                              }}
                            />
                            {category.imageUrl && (
                              <button
                                type="button"
                                disabled={imageBusyId === category.id}
                                onClick={() => removeCategoryImage(category)}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <input form={`category-${category.id}`} name="name" defaultValue={category.name} aria-label="Name" />
                        </td>
                        <td>
                          <input form={`category-${category.id}`} name="slug" defaultValue={category.slug} aria-label="Slug" />
                        </td>
                        <td>
                          <input
                            form={`category-${category.id}`}
                            name="description"
                            defaultValue={category.description ?? ""}
                            aria-label="Description"
                          />
                        </td>
                        <td>
                          <select form={`category-${category.id}`} name="status" defaultValue={category.status}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </td>
                        <td>
                          <input
                            form={`category-${category.id}`}
                            name="sortOrder"
                            type="number"
                            min="0"
                            defaultValue={category.sortOrder}
                            style={{ width: 60 }}
                            aria-label="Order"
                          />
                        </td>
                        <td>
                          <button form={`category-${category.id}`}>Save</button>
                          {/* This empty form carries no visible fields of its own — every input above
                              targets it via the HTML `form` attribute, since a <form> cannot be a
                              valid child of <tr> in table markup. */}
                          <form id={`category-${category.id}`} onSubmit={(event) => saveCategory(event, category.id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!categories.length && (
                  <div className="admin-empty">
                    <h3>No categories yet</h3>
                    <p>Add your first category to organize products.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
          <form className="campaign-upload" onSubmit={createCategory}>
            <p className="eyebrow">New category</p>
            <h2>Create category</h2>
            <label>
              <span>Name</span>
              <input required name="name" placeholder="Scarves" />
            </label>
            <label>
              <span>URL slug (optional)</span>
              <input name="slug" placeholder="scarves" />
            </label>
            <label>
              <span>Description</span>
              <textarea name="description" rows={3} />
            </label>
            <label>
              <span>Sequence</span>
              <input type="number" min="0" name="sortOrder" defaultValue={categories.length} />
            </label>
            <button className="admin-primary">Create category</button>
          </form>
        </div>
      ) : (
        <div className="collection-manager">
          <section>
            <div className="admin-table-card">
              <div className="admin-table-tools">
                <div>
                  <h2>Your catalogues</h2>
                  <span>{collections.length} collections</span>
                </div>
              </div>
              {collections.map((collection) => (
                <button key={collection.id} className={selected?.id === collection.id ? "active" : ""} onClick={() => setSelected(collection)}>
                  <div>
                    <strong>{collection.name}</strong>
                    <small>/collections/{collection.slug}</small>
                  </div>
                  <span>{collection.productCount} pieces</span>
                </button>
              ))}
            </div>
            {selected && (
              <>
                <form key={`${selected.id}-meta`} className="admin-settings-card" onSubmit={(event) => saveCollectionMeta(event, selected.id)}>
                  <div className="admin-form-grid">
                    <label>
                      <span>Name</span>
                      <input name="name" defaultValue={selected.name} />
                    </label>
                    <label>
                      <span>Slug</span>
                      <input name="slug" defaultValue={selected.slug} />
                    </label>
                    <label className="field-wide">
                      <span>Description</span>
                      <textarea name="description" rows={3} defaultValue={selected.description ?? ""} />
                    </label>
                    <label>
                      <span>Status</span>
                      <select name="status" defaultValue={selected.status}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                    <label>
                      <span>Sequence</span>
                      <input type="number" min="0" name="sortOrder" defaultValue={selected.sortOrder} />
                    </label>
                  </div>
                  <button className="admin-primary">Save collection details</button>
                </form>
                <form key={selected.id} className="collection-products" onSubmit={saveProducts}>
                  <p className="eyebrow">{selected.name}</p>
                  <h2>Included products</h2>
                  {products.map((product) => (
                    <label key={product.id}>
                      <input
                        type="checkbox"
                        name="productId"
                        value={product.id}
                        defaultChecked={assignments.some((entry) => entry.collectionId === selected.id && entry.productId === product.id)}
                      />
                      <span>
                        {product.name}
                        <small>{product.status}</small>
                      </span>
                    </label>
                  ))}
                  <button className="admin-primary">Save product selection</button>
                </form>
              </>
            )}
          </section>
          <form className="campaign-upload" onSubmit={createCollection}>
            <p className="eyebrow">New catalogue</p>
            <h2>Create collection</h2>
            <label>
              <span>Name</span>
              <input required name="name" placeholder="The Evening Edit" />
            </label>
            <label>
              <span>URL slug (optional)</span>
              <input name="slug" placeholder="evening-edit" />
            </label>
            <label>
              <span>Description</span>
              <textarea name="description" rows={4} />
            </label>
            <label>
              <span>Sequence</span>
              <input type="number" min="0" name="sortOrder" defaultValue={collections.length} />
            </label>
            <button className="admin-primary">Create collection</button>
          </form>
        </div>
      )}
    </section>
  );
}
