"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { AdminToast } from "../../admin-toast";
import { processImageClientSide } from "@/lib/client-image-processing";
import { buildTemplate, downloadBytes, readSheetFile, type TemplateLists } from "@/lib/import/sheet-io";
import {
  isImportable,
  missingCategories,
  parseSheetMatrix,
  planProducts,
  totalStock,
  type CategoryRef,
  type ParsedSheet,
  type PlannedProduct,
} from "@/lib/import/sheet-import";

type Options = TemplateLists & { categoryRows: CategoryRef[]; existingSlugs: string[]; existingSkus: string[] };
type Step = "sheet" | "check" | "photos" | "done";
type Outcome = { key: string; name: string; state: "created" | "failed" | "skipped"; detail: string; status?: "published" | "draft" };

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "sheet", label: "Sheet" },
  { id: "check", label: "Check" },
  { id: "photos", label: "Photos" },
  { id: "done", label: "Add" },
];

const money = (n: number) => `Rs. ${n.toLocaleString("en-PK")}`;

async function loadOptions(): Promise<Options> {
  const response = await fetch("/api/admin/products/bulk-options", { cache: "no-store" });
  if (!response.ok) throw new Error("Couldn't load your categories. Refresh and try again.");
  const data = (await response.json()) as {
    categories: CategoryRef[];
    existingSlugs: string[];
    existingSkus: string[];
    types: string[];
    labels: string[];
  };
  return {
    categoryRows: data.categories,
    categories: data.categories.filter((c) => c.status === "active").map((c) => c.name),
    existingSlugs: data.existingSlugs,
    existingSkus: data.existingSkus,
    types: data.types,
    labels: data.labels,
  };
}

async function uploadPhoto(productId: string, variantId: string | null, alt: string, isPrimary: boolean, file: File): Promise<boolean> {
  const processed = await processImageClientSide(file);
  if (!processed) return false;
  const form = new FormData();
  form.set("productId", productId);
  if (variantId) form.set("variantId", variantId);
  form.set("altText", alt);
  form.set("isPrimary", isPrimary ? "true" : "false");
  form.set("width", String(processed.width));
  form.set("height", String(processed.height));
  form.set("blurDataUrl", processed.blurDataUrl);
  form.set("variantWidths", JSON.stringify(processed.variants.map((v) => v.width)));
  for (const variant of processed.variants) form.set(`variant_${variant.width}`, variant.blob, `variant-${variant.width}.webp`);
  const largest = processed.variants[processed.variants.length - 1];
  form.set("file", largest.blob, `product-${largest.width}.webp`);
  const response = await fetch("/api/admin/images", { method: "POST", body: form });
  return response.ok;
}

/** Creates one product as a draft, adds its variants and photos, and only then (if it should be live) publishes it.
 * Any failure before the photos removes the half-made product again, so nothing broken is left in the store. */
async function createOne(product: PlannedProduct, files: Map<string, File>, report: (text: string) => void): Promise<Outcome> {
  const base = { key: product.key, name: product.name };
  let productId = "";
  const remove = async () => {
    if (productId) await fetch(`/api/admin/products/${productId}?permanent=true`, { method: "DELETE" }).catch(() => undefined);
  };
  try {
    report("Creating…");
    const created = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: product.name,
        slug: product.slug,
        categoryId: product.category!.id,
        typeLabel: product.typeLabel,
        shortDescription: product.shortDescription,
        description: product.description,
        material: product.material,
        careInstructions: product.careInstructions,
        badge: product.badge,
        featured: product.featured,
        primaryColour: product.primaryColour,
        status: "draft",
      }),
    });
    const createdBody = (await created.json().catch(() => ({}))) as { error?: string; product?: { id: string } };
    if (!created.ok || !createdBody.product) {
      return { ...base, state: created.status === 409 ? "skipped" : "failed", detail: createdBody.error ?? "The product couldn't be created." };
    }
    productId = createdBody.product.id;

    const variantIds: string[] = [];
    for (let i = 0; i < product.variants.length; i++) {
      const v = product.variants[i];
      report(`Adding ${v.colour}${v.size ? ` / ${v.size}` : ""}…`);
      const response = await fetch("/api/admin/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          name: v.name,
          sku: v.sku,
          color: v.colour,
          size: v.size,
          fabric: v.fabric,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stockQuantity: v.stock,
          isDefault: i === 0,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; variant?: { id: string } };
      if (!response.ok || !body.variant) {
        await remove();
        return { ...base, state: "failed", detail: `${v.colour}${v.size ? ` / ${v.size}` : ""}: ${body.error ?? "couldn't be added"} — nothing was kept for this product.` };
      }
      variantIds.push(body.variant.id);
    }

    let uploaded = 0;
    const failedPhotos: string[] = [];
    for (let i = 0; i < product.photos.length; i++) {
      const job = product.photos[i];
      report(`Photo ${i + 1} of ${product.photos.length}…`);
      const file = files.get(job.file.toLowerCase());
      const variantId = job.variantIndex === null ? null : (variantIds[job.variantIndex] ?? null);
      const ok = file ? await uploadPhoto(productId, variantId, job.alt, job.isPrimary, file).catch(() => false) : false;
      if (ok) uploaded++;
      else failedPhotos.push(job.file);
    }

    let status: "published" | "draft" = "draft";
    let detail = uploaded ? `${uploaded} photo${uploaded === 1 ? "" : "s"}` : "no photos";
    if (failedPhotos.length) detail += `; couldn't upload ${failedPhotos.join(", ")}`;
    if (product.finalStatus === "published" && uploaded > 0) {
      report("Publishing…");
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      });
      if (response.ok) status = "published";
      else detail += "; couldn't switch it on — it is hidden";
    } else if (product.wantsPublished) {
      detail += "; added hidden" + (product.draftReason ? ` (${product.draftReason})` : "");
    }
    return { ...base, state: "created", detail, status };
  } catch {
    await remove();
    return { ...base, state: "failed", detail: "Connection problem — nothing was kept for this product. Check Products before retrying." };
  }
}

export function BulkImport() {
  const [step, setStep] = useState<Step>("sheet");
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [fileList, setFileList] = useState<File[]>([]);
  const [photosSkipped, setPhotosSkipped] = useState(false);
  const [allowSizes, setAllowSizes] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string }>({ done: 0, total: 0, current: "" });
  const [dragging, setDragging] = useState(false);
  const [askCategories, setAskCategories] = useState<{ name: string; suggestion?: string; rows: number }[] | null>(null);
  const [notice, setNotice] = useState("");
  const sheetInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const fileMap = useMemo(() => {
    const map = new Map<string, File>();
    for (const file of fileList) if (!map.has(file.name.toLowerCase())) map.set(file.name.toLowerCase(), file);
    return map;
  }, [fileList]);

  const plan = useMemo(() => {
    if (!parsed || !options) return null;
    return planProducts(parsed.rows, {
      categories: options.categoryRows,
      existingSlugs: options.existingSlugs,
      existingSkus: options.existingSkus,
      files: photosSkipped ? [] : [...fileMap.values()].map((f) => f.name),
      allowSizes,
      forceDraft: false,
    });
  }, [parsed, options, fileMap, photosSkipped, allowSizes]);

  const ready = useMemo(() => (plan ? plan.products.filter((p) => isImportable(p, allowSizes)) : []), [plan, allowSizes]);
  const needSizeOk = plan ? plan.products.filter((p) => p.sizesNeedApproval && !p.errors.length && !p.alreadyExists) : [];
  const readyVariants = ready.reduce((n, p) => n + p.variants.length, 0);

  const getOptions = useCallback(async () => {
    if (options) return options;
    const loaded = await loadOptions();
    setOptions(loaded);
    return loaded;
  }, [options]);

  async function downloadSheet() {
    setError("");
    setBusy("Preparing the sheet…");
    try {
      const opts = await getOptions();
      const bytes = await buildTemplate(opts);
      downloadBytes("muse-and-silk-products-template.xlsx", bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The sheet couldn't be prepared.");
    } finally {
      setBusy("");
    }
  }

  async function onSheet(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy("Reading your sheet…");
    try {
      await getOptions();
      const result = await readSheetFile(file);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const sheet = parseSheetMatrix(result.matrix);
      if (sheet.fatal.length) {
        setError(sheet.fatal.join(" "));
        return;
      }
      if (!sheet.rows.length) {
        setError("The sheet has headings but no products in it yet.");
        return;
      }
      const loaded = await getOptions();
      setSheetName(file.name);
      setParsed(sheet);
      setStep("check");
      const missing = missingCategories(sheet.rows, loaded.categoryRows);
      if (missing.length) setAskCategories(missing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be read.");
    } finally {
      setBusy("");
    }
  }

  async function createCategories() {
    if (!askCategories || !options) return;
    setBusy("Creating categories…");
    const made: CategoryRef[] = [];
    const failed: string[] = [];
    for (const entry of askCategories) {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: entry.name, status: "active" }),
      }).catch(() => null);
      const body = response ? ((await response.json().catch(() => ({}))) as { error?: string; category?: CategoryRef }) : {};
      if (response?.ok && body.category) made.push({ id: body.category.id, name: body.category.name, slug: body.category.slug, status: body.category.status });
      else failed.push(`${entry.name}${body.error ? ` (${body.error})` : ""}`);
    }
    if (made.length) {
      setOptions({ ...options, categoryRows: [...options.categoryRows, ...made], categories: [...options.categories, ...made.map((c) => c.name)] });
      setNotice(`Created ${made.length} categor${made.length === 1 ? "y" : "ies"}: ${made.map((c) => c.name).join(", ")}.`);
    }
    if (failed.length) setError(`Couldn't create: ${failed.join("; ")}. Products in those categories can't be added yet.`);
    setAskCategories(null);
    setBusy("");
  }

  function addPhotos(list: FileList | File[] | null) {
    if (!list) return;
    const incoming = [...list].filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    setFileList((current) => {
      const names = new Set(current.map((f) => f.name.toLowerCase()));
      return [...current, ...incoming.filter((f) => !names.has(f.name.toLowerCase()))];
    });
    setPhotosSkipped(false);
  }

  async function run() {
    if (!ready.length) return;
    setError("");
    setStep("done");
    setOutcomes([]);
    const results: Outcome[] = [];
    setProgress({ done: 0, total: ready.length, current: "" });
    for (let i = 0; i < ready.length; i++) {
      const product = ready[i];
      const outcome = await createOne(product, fileMap, (text) => setProgress({ done: i, total: ready.length, current: `${product.name} — ${text}` }));
      results.push(outcome);
      setOutcomes([...results]);
      setProgress({ done: i + 1, total: ready.length, current: "" });
    }
  }

  function startOver() {
    setStep("sheet");
    setParsed(null);
    setFileList([]);
    setPhotosSkipped(false);
    setAllowSizes(false);
    setOutcomes([]);
    setError("");
    setSheetName("");
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const finished = step === "done" && progress.total > 0 && progress.done === progress.total;
  const created = outcomes.filter((o) => o.state === "created");
  const live = created.filter((o) => o.status === "published").length;

  return (
    <section className="admin-main bulk">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Muse &amp; Silk</p>
          <h1>Add many products</h1>
        </div>
        <div className="admin-top-actions">
          <Link href="/admin/products">← Products</Link>
        </div>
      </header>

      <ol className="bulk-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className={i === stepIndex ? "is-now" : i < stepIndex ? "is-done" : ""}>
            <span>{i < stepIndex ? "✓" : i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>

      <AdminToast message={error} tone="error" onClose={() => setError("")} />
      {!error && <AdminToast message={notice} tone="ok" onClose={() => setNotice("")} />}
      {askCategories && (
        <div className="bulk-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-cat-title">
          <div className="bulk-modal-box">
            <h2 id="bulk-cat-title">Create {askCategories.length === 1 ? "a new category" : `${askCategories.length} new categories`}?</h2>
            <p>Your sheet uses {askCategories.length === 1 ? "a category that is" : "categories that are"} not in your store yet:</p>
            <ul>
              {askCategories.map((c) => (
                <li key={c.name}>
                  <strong>{c.name}</strong> — {c.rows} row{c.rows === 1 ? "" : "s"}
                  {c.suggestion ? <small> Did you mean the existing &ldquo;{c.suggestion}&rdquo;? If so, choose Not now and fix the spelling in the sheet.</small> : null}
                </li>
              ))}
            </ul>
            <p className="bulk-muted">They are created as active categories. You can add a cover picture and reorder them later under Categories &amp; Collections.</p>
            <div className="bulk-actions">
              <button className="bulk-secondary" onClick={() => setAskCategories(null)} disabled={!!busy}>
                Not now
              </button>
              <button className="admin-primary" onClick={createCategories} disabled={!!busy}>
                Create {askCategories.length === 1 ? "category" : `${askCategories.length} categories`}
              </button>
            </div>
          </div>
        </div>
      )}
      {busy && (
        <div className="admin-message" role="status">
          {busy}
        </div>
      )}

      {step === "sheet" && (
        <div className="admin-settings-card bulk-card">
          <h2>Add many products with Excel</h2>
          <p>
            Fill one sheet with all your products, choose their pictures, and they are added in one go. <strong>One row for each colour.</strong> Products without a photo are added hidden, so
            shoppers never see an empty picture. Products already in your store are never changed.
          </p>
          <div className="bulk-two">
            <div>
              <h3>1. Get the sheet</h3>
              <p>An Excel sheet with your categories already in the dropdowns, plus an example and instructions.</p>
              <button className="admin-primary" onClick={downloadSheet} disabled={!!busy}>
                Download the Excel sheet
              </button>
            </div>
            <div>
              <h3>2. Upload your filled sheet</h3>
              <p>An .xlsx file — or a .csv downloaded from Google Sheets.</p>
              <input
                ref={sheetInput}
                type="file"
                accept=".xlsx,.xlsm,.csv"
                hidden
                onChange={(e) => {
                  void onSheet(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button className="admin-primary" onClick={() => sheetInput.current?.click()} disabled={!!busy}>
                Choose your sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "check" && plan && parsed && (
        <div className="admin-settings-card bulk-card">
          <h2>
            {ready.length} product{ready.length === 1 ? "" : "s"} · {readyVariants} variant{readyVariants === 1 ? "" : "s"} ready
          </h2>
          <p className="bulk-muted">
            From {sheetName}.{parsed.ignoredColumns.length ? ` Not used by this store, ignored: ${parsed.ignoredColumns.join(", ")}.` : ""}
          </p>

          {plan.rowProblems.length > 0 && (
            <div className="bulk-problems">
              <strong>Rows that couldn&rsquo;t be read</strong>
              <ul>
                {plan.rowProblems.slice(0, 20).map((p, i) => (
                  <li key={i}>
                    Row {p.rowNumber}: {p.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsed && options && missingCategories(parsed.rows, options.categoryRows).length > 0 && (
            <div className="bulk-problems">
              <strong>Some categories don&rsquo;t exist yet.</strong>{" "}
              <button className="bulk-secondary" onClick={() => setAskCategories(missingCategories(parsed.rows, options.categoryRows))}>
                Create them…
              </button>
            </div>
          )}

          {needSizeOk.length > 0 && (
            <label className="bulk-approve">
              <input type="checkbox" checked={allowSizes} onChange={(e) => setAllowSizes(e.target.checked)} />
              <span>
                <strong>
                  {needSizeOk.length} product{needSizeOk.length === 1 ? " has" : "s have"} several sizes.
                </strong>{" "}
                The product page shows one button per colour and has no size picker yet, so shoppers can&rsquo;t choose a size. Tick to add them anyway (each size is stored with its own stock), or
                leave unticked to skip them.
              </span>
            </label>
          )}

          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Variants</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {plan.products.map((p) => {
                  const ok = isImportable(p, allowSizes);
                  const prices = p.variants.map((v) => v.price);
                  const lo = Math.min(...prices);
                  const hi = Math.max(...prices);
                  return (
                    <tr key={p.key} className={ok ? "" : "bulk-row-bad"}>
                      <td>
                        {p.name}
                        <small>{p.typeLabel}</small>
                      </td>
                      <td>{p.category?.name ?? p.categoryName}</td>
                      <td>{p.variants.length ? p.variants.map((v) => [v.colour, v.size].filter(Boolean).join(" ")).join(", ") : "—"}</td>
                      <td>{prices.length ? (lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`) : "—"}</td>
                      <td>{totalStock(p)}</td>
                      <td>
                        {p.alreadyExists ? <span className="bulk-note">Already in your store — skipped</span> : null}
                        {p.sizesNeedApproval && !allowSizes && !p.errors.length && !p.alreadyExists ? <span className="bulk-note">Several sizes — see above</span> : null}
                        {p.errors.map((m, i) => (
                          <span key={`e${i}`} className="bulk-err">
                            {m}
                          </span>
                        ))}
                        {p.warnings.map((m, i) => (
                          <span key={`w${i}`} className="bulk-note">
                            {m}
                          </span>
                        ))}
                        {ok && !p.errors.length && !p.warnings.length ? "✓" : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bulk-actions">
            <button className="bulk-secondary" onClick={startOver}>
              Choose another sheet
            </button>
            <button className="admin-primary" disabled={!ready.length} onClick={() => setStep("photos")}>
              {ready.length ? `Continue with ${ready.length}` : "Nothing to add yet — fix the sheet"}
            </button>
          </div>
        </div>
      )}

      {step === "photos" && plan && (
        <div className="admin-settings-card bulk-card">
          <h2>Choose the pictures</h2>
          <p>
            Select every picture file for these products at once (JPG, PNG or WebP). They are matched to products by <strong>file name</strong> as written in your sheet.
          </p>
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          <div
            className={`bulk-drop${dragging ? " is-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addPhotos(e.dataTransfer.files);
            }}
            onClick={() => photoInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") photoInput.current?.click();
            }}
          >
            <strong>{fileList.length ? `${fileList.length} picture${fileList.length === 1 ? "" : "s"} chosen — add more` : "Drop pictures here, or click to choose"}</strong>
            <span>Tip: put all pictures in one folder, then select them all.</span>
          </div>

          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Pictures found</th>
                  <th>Will be</th>
                </tr>
              </thead>
              <tbody>
                {ready.map((p) => (
                  <tr key={p.key}>
                    <td>{p.name}</td>
                    <td>
                      {p.requestedPhotoCount === 0 ? <span className="bulk-note">No file names in the sheet</span> : `${p.photos.length} of ${p.requestedPhotoCount} found`}
                      {p.missingPhotos.length ? <span className="bulk-err">missing: {p.missingPhotos.join(", ")}</span> : null}
                    </td>
                    <td>{p.finalStatus === "published" ? "On the website" : <span className="bulk-note">Hidden{p.draftReason ? ` — ${p.draftReason}` : ""}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.unusedFiles.length > 0 && (
            <p className="bulk-muted">
              Not used by any product: {plan.unusedFiles.slice(0, 15).join(", ")}
              {plan.unusedFiles.length > 15 ? "…" : ""}
            </p>
          )}
          {ready.some((p) => p.wantsPublished && p.finalStatus === "draft") && (
            <p className="bulk-warn">
              Products with no picture found are added <strong>hidden</strong>. You can add pictures and switch them on later from Products.
            </p>
          )}

          <div className="bulk-actions">
            <button className="bulk-secondary" onClick={() => setStep("check")}>
              ← Back
            </button>
            {!fileList.length && !photosSkipped && (
              <button className="bulk-secondary" onClick={() => setPhotosSkipped(true)}>
                Skip pictures
              </button>
            )}
            <button className="admin-primary" disabled={!ready.length} onClick={run}>
              Add {ready.length} product{ready.length === 1 ? "" : "s"} now
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="admin-settings-card bulk-card">
          <h2>{finished ? "Finished" : "Adding your products…"}</h2>
          <div className="bulk-bar" aria-hidden="true">
            <i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="bulk-muted" role="status">
            {finished
              ? `${created.length} added (${live} on the website, ${created.length - live} hidden)${outcomes.length - created.length ? `, ${outcomes.length - created.length} not added` : ""}.`
              : `${progress.done} of ${progress.total} done. ${progress.current} Please keep this page open.`}
          </p>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o.key} className={o.state === "failed" ? "bulk-row-bad" : ""}>
                    <td>{o.name}</td>
                    <td>{o.state === "created" ? `${o.status === "published" ? "✓ On the website" : "Added hidden"} — ${o.detail}` : `${o.state === "skipped" ? "Skipped" : "Not added"} — ${o.detail}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {finished && (
            <div className="bulk-actions">
              <button className="bulk-secondary" onClick={startOver}>
                Add more
              </button>
              <Link className="admin-primary" href="/admin/products">
                View products
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
