"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACCEPTED_PICTURES, checkPictureFile, uploadProductPicture } from "@/lib/client-upload";
import { mediaUrl } from "@/lib/media-url";
import { suggestSku } from "@/lib/sku";
import { useLockedAction } from "@/lib/use-locked-action";
import { callApi, Dialog, Hint, useToast } from "../../_ui/client";
import { Icon } from "../../_ui/icons";
import { pkr } from "../../_ui/ui";

export type EditorCategory = { id: string; name: string };
export type EditorProduct = {
  id: string;
  name: string;
  categoryId: string;
  typeLabel: string;
  primaryColour: string;
  material: string;
  shortDescription: string;
  description: string;
  careInstructions: string;
  status: "draft" | "published" | "archived";
  featured: boolean;
  badge: string;
};
export type EditorVariantRow = { id: string; size: string; sku: string; price: number; compareAtPrice: number | null; stockQuantity: number; reservedQuantity: number; lowStockThreshold: number };
export type EditorImageRow = { id: string; r2Key: string; variantWidths: number[] | null; isPrimary: boolean; sortOrder: number; altText: string };

type VariantDraft = { key: string; id?: string; size: string; sku: string; skuTouched: boolean; price: string; compareAt: string; stock: string; low: string; reserved: number };
type PhotoDraft = { key: string; id?: string; url: string; file?: File; isPrimary: boolean };

const TYPES = ["Shalwar Kameez", "Kurta", "Shirt", "T-Shirt", "Polo Shirt", "Pants", "Cargo Pants", "Jeans", "Waistcoat", "Sweater", "Hoodie", "Wallet", "Belt", "Card Holder", "Cap", "Socks"];
const TEXT_SIZES = ["S", "M", "L", "XL", "XXL"];
const WAIST_SIZES = ["28", "30", "32", "34", "36", "38"];
const BADGES = ["", "New", "Sale", "Bestseller", "Limited"];

let counter = 0;
const uid = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export function ProductEditor({ categories, product, variants: initialVariants, images: initialImages }: { categories: EditorCategory[]; product?: EditorProduct; variants?: EditorVariantRow[]; images?: EditorImageRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const saver = useLockedAction();
  const writer = useLockedAction();
  const isNew = !product;

  const [form, setForm] = useState({
    name: product?.name ?? "",
    categoryId: product?.categoryId ?? categories[0]?.id ?? "",
    typeLabel: product?.typeLabel ?? "",
    primaryColour: product?.primaryColour ?? "",
    material: product?.material ?? "",
    shortDescription: product?.shortDescription ?? "",
    description: product?.description ?? "",
    careInstructions: product?.careInstructions ?? "",
    status: (product?.status ?? "published") as "draft" | "published" | "archived",
    featured: product?.featured ?? false,
    badge: product?.badge ?? "",
  });
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    initialVariants?.length
      ? initialVariants.map((v) => ({ key: v.id, id: v.id, size: v.size, sku: v.sku, skuTouched: true, price: String(v.price), compareAt: v.compareAtPrice ? String(v.compareAtPrice) : "", stock: String(v.stockQuantity), low: String(v.lowStockThreshold), reserved: v.reservedQuantity }))
      : [{ key: uid(), size: "", sku: "", skuTouched: false, price: "", compareAt: "", stock: "0", low: "3", reserved: 0 }],
  );
  const [removedVariants, setRemovedVariants] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PhotoDraft[]>(() =>
    [...(initialImages ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder).map((img) => ({ key: img.id, id: img.id, url: mediaUrl(img.r2Key, img.variantWidths), isPrimary: img.isPrimary })),
  );
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [over, setOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Local blob previews are released when a picture is removed or the page closes.
  const blobUrls = useRef<string[]>([]);
  useEffect(() => () => blobUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = useCallback(() => setDirty(true), []);
  const setField = (name: keyof typeof form) => (event: { target: { value: string } }) => {
    setForm((current) => ({ ...current, [name]: event.target.value }));
    touch();
  };

  /* ---------------------------------- photos ---------------------------------- */
  function addFiles(list: FileList | File[]) {
    const problems: string[] = [];
    const next: PhotoDraft[] = [];
    for (const file of Array.from(list)) {
      const problem = checkPictureFile(file);
      if (problem) {
        problems.push(problem);
        continue;
      }
      const url = URL.createObjectURL(file);
      blobUrls.current.push(url);
      next.push({ key: uid(), url, file, isPrimary: false });
    }
    if (problems.length) toast(problems[0] + (problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""), "bad");
    if (!next.length) return;
    setPhotos((current) => {
      const all = [...current, ...next].slice(0, 12);
      if (!all.some((p) => p.isPrimary) && all[0]) all[0] = { ...all[0], isPrimary: true };
      return all;
    });
    touch();
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    addFiles(event.dataTransfer.files);
  };
  const makeMain = (key: string) => {
    setPhotos((current) => {
      const picked = current.find((p) => p.key === key);
      if (!picked) return current;
      return [{ ...picked, isPrimary: true }, ...current.filter((p) => p.key !== key).map((p) => ({ ...p, isPrimary: false }))];
    });
    touch();
  };
  const movePhoto = (key: string, delta: -1 | 1) => {
    setPhotos((current) => {
      const index = current.findIndex((p) => p.key === key);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
    touch();
  };
  const removePhoto = (photo: PhotoDraft) => {
    if (photo.id) setRemovedPhotos((current) => [...current, photo.id as string]);
    setPhotos((current) => {
      const rest = current.filter((p) => p.key !== photo.key);
      if (photo.isPrimary && rest[0]) rest[0] = { ...rest[0], isPrimary: true };
      return rest;
    });
    touch();
  };

  /* --------------------------------- variants --------------------------------- */
  const updateVariant = (key: string, patch: Partial<VariantDraft>) => {
    setVariants((current) => current.map((v) => (v.key === key ? { ...v, ...patch } : v)));
    touch();
  };
  const addSizes = (sizes: string[]) => {
    setVariants((current) => {
      const have = new Set(current.map((v) => v.size.toLowerCase()));
      const base = current.find((v) => v.price) ?? current[0];
      // Replace the single empty starter row instead of leaving a blank row above the new sizes.
      const start = current.length === 1 && !current[0].size && !current[0].sku ? [] : current;
      const fresh = sizes.filter((s) => !have.has(s.toLowerCase())).map((size) => ({ key: uid(), size, sku: "", skuTouched: false, price: base?.price ?? "", compareAt: base?.compareAt ?? "", stock: "0", low: "3", reserved: 0 }));
      return [...start, ...fresh];
    });
    touch();
  };
  const removeVariant = (v: VariantDraft) => {
    if (v.id) setRemovedVariants((current) => [...current, v.id as string]);
    setVariants((current) => (current.length === 1 ? [{ ...current[0], id: undefined, key: uid(), size: "", sku: "", skuTouched: false, price: "", compareAt: "", stock: "0" }] : current.filter((x) => x.key !== v.key)));
    touch();
  };
  const withSkus = useMemo(() => variants.map((v) => ({ ...v, sku: v.skuTouched || v.id ? v.sku : suggestSku(form.name, form.typeLabel, v.size) })), [variants, form.name, form.typeLabel]);

  /* ----------------------------------- AI text ---------------------------------- */
  async function writeText(mode: "write" | "rewrite") {
    if (!form.name.trim()) {
      toast("Please type the product name first — the helper needs it.", "bad");
      return;
    }
    await writer.run(async () => {
      const categoryName = categories.find((c) => c.id === form.categoryId)?.name;
      const result = await callApi<{ description: string }>("/api/admin/ai-description", "POST", { name: form.name, type: form.typeLabel, category: categoryName, color: form.primaryColour, material: form.material, existing: form.description, mode });
      if (result.ok) {
        setForm((current) => ({ ...current, description: result.data.description }));
        touch();
        toast(mode === "rewrite" ? "Done. Please read it, and change anything you like." : "Written. Please read it, and change anything you like.", "good");
      } else toast(result.error, "bad");
    });
  }

  /* ------------------------------------ save ------------------------------------ */
  function validate(): string[] {
    const problems: string[] = [];
    if (!form.name.trim()) problems.push("Please type the product name.");
    if (!form.categoryId) problems.push("Please choose a category (create one first under Categories).");
    if (!form.typeLabel.trim()) problems.push("Please say what kind of product it is, for example Shirt or Pants.");
    if (!form.primaryColour.trim()) problems.push("Please type the colour.");
    const sizes = new Set<string>();
    withSkus.forEach((v, index) => {
      const label = v.size ? `Size ${v.size}` : `Row ${index + 1}`;
      if (!v.price || Number(v.price) < 1) problems.push(`${label}: please enter a price.`);
      if (v.compareAt && Number(v.compareAt) <= Number(v.price)) problems.push(`${label}: the old price must be higher than the selling price (or leave it empty).`);
      if (!v.sku.trim()) problems.push(`${label}: the product code is missing.`);
      const key = v.size.trim().toLowerCase();
      if (sizes.has(key)) problems.push(`${label} is listed twice.`);
      sizes.add(key);
    });
    const codes = withSkus.map((v) => v.sku.trim().toLowerCase());
    if (new Set(codes).size !== codes.length) problems.push("Two sizes have the same product code. Every size needs its own code.");
    if (form.status === "published" && photos.length === 0) problems.push("Add at least one photo before showing this product on the website (or choose “Hidden”).");
    return problems;
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    const problems = validate();
    setErrors(problems);
    if (problems.length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    await saver.run(async () => {
      const fail = (message: string) => {
        setErrors([message]);
        setProgress("");
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
      // 1. the product
      setProgress("Saving the product…");
      const payload = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        typeLabel: form.typeLabel.trim(),
        primaryColour: form.primaryColour.trim(),
        material: form.material.trim() || null,
        shortDescription: form.shortDescription.trim() || null,
        description: form.description.trim() || null,
        careInstructions: form.careInstructions.trim() || null,
        status: form.status,
        featured: form.featured,
        badge: form.badge || null,
      };
      const saved = await callApi<{ product: { id: string } }>(isNew ? "/api/admin/products" : `/api/admin/products/${product!.id}`, isNew ? "POST" : "PATCH", isNew ? { ...payload, material: payload.material ?? undefined, shortDescription: payload.shortDescription ?? undefined, description: payload.description ?? undefined, careInstructions: payload.careInstructions ?? undefined, badge: payload.badge ?? undefined } : payload);
      if (!saved.ok) return fail(saved.error);
      const productId = saved.data.product.id;

      // 2. sizes, prices and stock
      let first = true;
      for (const v of withSkus) {
        setProgress(`Saving ${v.size ? `size ${v.size}` : "price and stock"}…`);
        const body = {
          name: `${form.primaryColour.trim()}${v.size ? ` / ${v.size}` : ""}`,
          sku: v.sku.trim(),
          color: form.primaryColour.trim(),
          size: v.size.trim(),
          price: Number(v.price),
          stockQuantity: Number(v.stock || 0),
          lowStockThreshold: Number(v.low || 3),
        };
        const result = v.id
          ? await callApi(`/api/admin/variants/${v.id}`, "PATCH", { ...body, compareAtPrice: v.compareAt ? Number(v.compareAt) : null })
          : await callApi("/api/admin/variants", "POST", { ...body, productId, compareAtPrice: v.compareAt ? Number(v.compareAt) : undefined, isDefault: first });
        if (!result.ok) return fail(`${v.size ? `Size ${v.size}` : "Price and stock"}: ${result.error}`);
        first = false;
      }
      for (const id of removedVariants) await callApi(`/api/admin/variants/${id}`, "DELETE");

      // 3. photos
      for (const id of removedPhotos) await callApi(`/api/admin/images/${id}`, "DELETE");
      let uploaded = 0;
      const newCount = photos.filter((p) => p.file).length;
      for (let index = 0; index < photos.length; index++) {
        const photo = photos[index];
        if (photo.file) {
          uploaded += 1;
          setProgress(`Uploading photo ${uploaded} of ${newCount}…`);
          const outcome = await uploadProductPicture({ productId, file: photo.file, altText: `${form.name.trim()}${index ? ` — photo ${index + 1}` : ""}`, isPrimary: photo.isPrimary, sortOrder: index });
          if (!outcome.ok) return fail(`The product was saved, but a photo failed: ${outcome.error}`);
        } else if (photo.id) {
          await callApi(`/api/admin/images/${photo.id}`, "PATCH", { sortOrder: index, ...(photo.isPrimary ? { isPrimary: true } : {}) });
        }
      }

      setDirty(false);
      setProgress("");
      toast(isNew ? "Product added." : "Saved.", "good");
      if (isNew) router.replace(`/admin/products/${productId}`);
      else router.refresh();
    });
  }

  async function removeProduct(permanent: boolean) {
    if (!product) return;
    const result = await callApi(`/api/admin/products/${product.id}${permanent ? "?permanent=true" : ""}`, "DELETE");
    if (result.ok) {
      toast(permanent ? "Product deleted." : "Product is now hidden from your website.", "good");
      setDirty(false);
      router.push("/admin/products");
      router.refresh();
    } else toast(result.error, "bad");
  }

  const busy = saver.pending;
  const saleLooksWrong = withSkus.some((v) => v.compareAt && Number(v.compareAt) <= Number(v.price));

  return (
    <form onSubmit={save} className="a-stack">
      {errors.length > 0 && (
        <div className="a-note bad" role="alert">
          <Icon name="alert" />
          <div>
            <strong>Please fix this first:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <section className="a-card">
        <header className="a-card-head">
          <h2>1. About the product</h2>
        </header>
        <div className="a-card-pad a-form-grid">
          <div className="a-field wide">
            <label htmlFor="pe-name">Product name</label>
            <input id="pe-name" value={form.name} onChange={setField("name")} placeholder="e.g. Olive Cargo Pants" maxLength={120} autoFocus={isNew} />
          </div>
          <div className="a-field">
            <label htmlFor="pe-cat">
              Category <Hint text="Where customers find it on your website, e.g. Shirts or Shalwar Kameez. You can add categories under “Categories”." />
            </label>
            <select id="pe-cat" value={form.categoryId} onChange={setField("categoryId")}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="a-field">
            <label htmlFor="pe-type">
              What is it? <Hint text="Pick from the list or type your own. It helps customers searching on Google." />
            </label>
            <input id="pe-type" value={form.typeLabel} onChange={setField("typeLabel")} list="pe-types" placeholder="e.g. Pants" />
            <datalist id="pe-types">
              {TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="a-field">
            <label htmlFor="pe-colour">Colour</label>
            <input id="pe-colour" value={form.primaryColour} onChange={setField("primaryColour")} placeholder="e.g. Olive" />
            <span className="a-help">Selling the same item in another colour? Add it as a separate product.</span>
          </div>
          <div className="a-field">
            <label htmlFor="pe-fabric">Fabric (optional)</label>
            <input id="pe-fabric" value={form.material} onChange={setField("material")} placeholder="e.g. Cotton twill" />
          </div>
          <div className="a-field wide">
            <div className="a-row" style={{ justifyContent: "space-between" }}>
              <label htmlFor="pe-desc">
                Description <Hint text="What customers read on the product page. Press “Write it for me” to get a first draft, then change anything you like." />
              </label>
              <span className="a-row">
                <button type="button" className="a-btn a-btn-sm" disabled={writer.pending} onClick={() => writeText("write")} title="Writes a short description from the name, colour and fabric">
                  {writer.pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkle" size={15} />} Write it for me
                </button>
                <button type="button" className="a-btn a-btn-sm" disabled={writer.pending || !form.description.trim()} onClick={() => writeText("rewrite")} title="Rewrites what you typed so it is easier to find on Google">
                  Improve for Google
                </button>
              </span>
            </div>
            <textarea id="pe-desc" value={form.description} onChange={setField("description")} rows={5} placeholder="Tell customers about the fit, the fabric and when to wear it." maxLength={2000} />
          </div>
          <div className="a-field wide">
            <label htmlFor="pe-short">One short line (optional)</label>
            <input id="pe-short" value={form.shortDescription} onChange={setField("shortDescription")} placeholder="Shown under the product name in lists" maxLength={200} />
          </div>
          <div className="a-field wide">
            <label htmlFor="pe-care">How to wash it (optional)</label>
            <input id="pe-care" value={form.careInstructions} onChange={setField("careInstructions")} placeholder="e.g. Machine wash cold. Do not bleach. Iron on medium heat." maxLength={500} />
          </div>
        </div>
      </section>

      <section className="a-card">
        <header className="a-card-head">
          <h2>2. Photos</h2>
          <small>{photos.length} of 12 · the first photo is the main one</small>
        </header>
        <div className="a-card-pad a-stack" style={{ gap: 14 }}>
          <div
            className={`a-drop${over ? " is-over" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && fileInput.current?.click()}
            aria-label="Add photos"
          >
            <Icon name="camera" />
            <strong>Drag photos here, or click to choose</strong>
            <span>You can pick many at once. JPG, PNG or WebP. We make them small and fast for you automatically.</span>
          </div>
          <input ref={fileInput} type="file" accept={ACCEPTED_PICTURES} multiple hidden onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
          {photos.length > 0 && (
            <div className="a-photos">
              {photos.map((photo, index) => (
                <div key={photo.key} className="a-photo">
                  <div className="img">
                    {photo.file ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo.url} alt={`Photo ${index + 1}`} />
                    ) : (
                      <Image src={photo.url} alt={`Photo ${index + 1}`} fill sizes="160px" />
                    )}
                    {photo.isPrimary && <span className="main-tag">Main photo</span>}
                  </div>
                  <div className="tools">
                    <button type="button" onClick={() => movePhoto(photo.key, -1)} disabled={index === 0} aria-label="Move earlier" title="Move earlier">←</button>
                    <button type="button" onClick={() => movePhoto(photo.key, 1)} disabled={index === photos.length - 1} aria-label="Move later" title="Move later">→</button>
                    {!photo.isPrimary && <button type="button" onClick={() => makeMain(photo.key)}>Make main</button>}
                    <button type="button" className="del" onClick={() => removePhoto(photo)} aria-label="Remove photo" title="Remove this photo">
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="a-card">
        <header className="a-card-head">
          <h2>3. Sizes, prices and stock</h2>
          <Hint text="One row for each size. Stock is how many you have on the shelf right now. When stock reaches 0 the size shows “Sold out”." below />
        </header>
        <div className="a-card-pad a-stack" style={{ gap: 14 }}>
          <div className="a-row">
            <span className="a-muted">Quick add:</span>
            <button type="button" className="a-btn a-btn-sm" onClick={() => addSizes(TEXT_SIZES)}>
              S M L XL XXL
            </button>
            <button type="button" className="a-btn a-btn-sm" onClick={() => addSizes(WAIST_SIZES)}>
              Waist 28–38
            </button>
            <button type="button" className="a-btn a-btn-sm" onClick={() => addSizes(["One size"])}>
              One size only
            </button>
            <button type="button" className="a-btn a-btn-sm" onClick={() => addSizes([""])} title="Add one more row">
              <Icon name="plus" size={15} /> Another row
            </button>
          </div>
          <div className="a-table-wrap">
            <table className="a-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>
                    Price (PKR) <Hint text="What the customer pays." below />
                  </th>
                  <th>
                    Old price <Hint text="Optional. If you fill this in, customers see the old price crossed out next to the price — a simple way to show a discount." below />
                  </th>
                  <th>In stock</th>
                  <th>
                    Warn me at <Hint text="You get an alert when the stock falls to this number or lower." below />
                  </th>
                  <th>
                    Product code <Hint text="A short code that is different for every size. We make one for you — you can change it. It is printed on your packing slip." below />
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {withSkus.map((v) => (
                  <tr key={v.key}>
                    <td style={{ width: 110 }}>
                      <input aria-label="Size" value={v.size} onChange={(event) => updateVariant(v.key, { size: event.target.value })} placeholder="M" maxLength={20} />
                    </td>
                    <td style={{ width: 130 }}>
                      <input aria-label="Price" value={v.price} onChange={(event) => updateVariant(v.key, { price: event.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="5500" />
                    </td>
                    <td style={{ width: 130 }}>
                      <input aria-label="Old price" value={v.compareAt} onChange={(event) => updateVariant(v.key, { compareAt: event.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="optional" />
                    </td>
                    <td style={{ width: 110 }}>
                      <input aria-label="In stock" value={v.stock} onChange={(event) => updateVariant(v.key, { stock: event.target.value.replace(/\D/g, "") })} inputMode="numeric" />
                      {v.reserved > 0 && <small className="a-help">{v.reserved} held for orders</small>}
                    </td>
                    <td style={{ width: 100 }}>
                      <input aria-label="Warn me at" value={v.low} onChange={(event) => updateVariant(v.key, { low: event.target.value.replace(/\D/g, "") })} inputMode="numeric" />
                    </td>
                    <td>
                      <input aria-label="Product code" value={v.sku} onChange={(event) => updateVariant(v.key, { sku: event.target.value.toUpperCase().replace(/\s/g, ""), skuTouched: true })} maxLength={40} />
                    </td>
                    <td style={{ width: 52 }}>
                      <button type="button" className="a-icon-btn" aria-label={`Remove size ${v.size || "row"}`} onClick={() => removeVariant(v)} title="Remove this size">
                        <Icon name="trash" size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {withSkus.length > 1 && (
            <div className="a-row">
              <button type="button" className="a-btn a-btn-sm" onClick={() => { const first = variants.find((v) => v.price); if (first) { setVariants((c) => c.map((v) => ({ ...v, price: first.price, compareAt: first.compareAt }))); touch(); } }} disabled={!variants.some((v) => v.price)}>
                Use the first price for every size
              </button>
            </div>
          )}
          {saleLooksWrong && <p className="a-error">The old price must be higher than the price, otherwise it will not look like a discount.</p>}
          {withSkus[0]?.price && <p className="a-help">Customers will see {pkr(Number(withSkus[0].price))}{withSkus[0].compareAt ? ` (was ${pkr(Number(withSkus[0].compareAt))})` : ""}.</p>}
        </div>
      </section>

      <section className="a-card">
        <header className="a-card-head">
          <h2>4. Show it on your website?</h2>
        </header>
        <div className="a-card-pad a-form-grid">
          <fieldset style={{ border: 0, margin: 0, padding: 0, gridColumn: "1 / -1", display: "grid", gap: 10 }}>
            <legend className="sr-only">Visibility</legend>
            <label className="a-check">
              <input type="radio" name="pe-status" checked={form.status === "published"} onChange={() => { setForm((c) => ({ ...c, status: "published" })); touch(); }} />
              <span>
                <strong>Yes — show it to customers</strong>
                <small className="a-help" style={{ display: "block" }}>Customers can see it and buy it right away.</small>
              </span>
            </label>
            <label className="a-check">
              <input type="radio" name="pe-status" checked={form.status === "draft"} onChange={() => { setForm((c) => ({ ...c, status: "draft" })); touch(); }} />
              <span>
                <strong>Hidden for now</strong>
                <small className="a-help" style={{ display: "block" }}>Only you can see it. Good while you are still getting it ready.</small>
              </span>
            </label>
            {form.status === "archived" && <p className="a-note warn">This product is archived (hidden). Choose one of the options above to bring it back.</p>}
          </fieldset>
          <label className="a-check">
            <input type="checkbox" checked={form.featured} onChange={(event) => { setForm((c) => ({ ...c, featured: event.target.checked })); touch(); }} />
            <span>
              <strong>Show on the home page</strong>
              <small className="a-help" style={{ display: "block" }}>Puts it in the “New arrivals” row.</small>
            </span>
          </label>
          <div className="a-field">
            <label htmlFor="pe-badge">
              Small label on the photo <Hint text="A little tag in the corner of the product photo, like “New” or “Bestseller”." />
            </label>
            <select id="pe-badge" value={form.badge} onChange={setField("badge")}>
              {BADGES.map((badge) => (
                <option key={badge} value={badge}>
                  {badge || "None"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="a-savebar">
        <div>
          {busy ? (
            <span className="busy-label">
              <span className="spinner" aria-hidden="true" /> {progress || "Saving…"}
            </span>
          ) : dirty ? (
            <span className="a-muted">You have changes that are not saved yet.</span>
          ) : (
            <span className="a-muted">{isNew ? "Fill in the sections above, then press Save." : "Everything is saved."}</span>
          )}
        </div>
        <div className="a-row">
          {!isNew && (
            <button type="button" className="a-btn a-btn-quiet" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Icon name="trash" size={16} /> Delete…
            </button>
          )}
          <button type="button" className="a-btn" onClick={() => router.push("/admin/products")} disabled={busy}>
            {dirty ? "Leave without saving" : "Back to products"}
          </button>
          <button className="a-btn a-btn-primary a-btn-lg" disabled={busy} aria-busy={busy}>
            {busy ? (
              <span className="busy-label">
                <span className="spinner spinner-light" aria-hidden="true" /> Saving…
              </span>
            ) : isNew ? (
              "Add product"
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </div>

      {confirmDelete && product && (
        <Dialog title={`Remove “${product.name}”?`} onClose={() => setConfirmDelete(false)}>
          <p>Choose what you want to do.</p>
          <div className="a-stack" style={{ gap: 10 }}>
            <button type="button" className="a-btn a-btn-lg" onClick={() => removeProduct(false)} style={{ justifyContent: "flex-start", height: "auto", padding: "12px 16px", whiteSpace: "normal", textAlign: "left" }}>
              <span>
                <strong>Hide it from my website</strong>
                <small className="a-muted" style={{ display: "block", fontWeight: 400 }}>Recommended. Nothing is lost and you can bring it back any time.</small>
              </span>
            </button>
            <button type="button" className="a-btn a-btn-danger a-btn-lg" onClick={() => removeProduct(true)} style={{ justifyContent: "flex-start", height: "auto", padding: "12px 16px", whiteSpace: "normal", textAlign: "left" }}>
              <span>
                <strong>Delete it forever</strong>
                <small style={{ display: "block", fontWeight: 400 }}>The product and its photos are erased. Old orders keep their record. This cannot be undone.</small>
              </span>
            </button>
          </div>
          <div className="a-dialog-actions">
            <button type="button" className="a-btn" onClick={() => setConfirmDelete(false)}>
              Go back
            </button>
          </div>
        </Dialog>
      )}
    </form>
  );
}
