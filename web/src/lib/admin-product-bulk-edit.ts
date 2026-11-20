import { supabase } from "./supabase";
import { withOrderMethod, type OrderMethod } from "./whatsapp-order";
import type { AdminProduct, ProductType } from "./admin-products";

export type BulkEditChanges = {
  image_url: string | null;
  status: "keep" | "active" | "inactive";
  order_method: "keep" | OrderMethod;
  replace_description: boolean;
  description: string;
};
export const emptyBulkEdit: BulkEditChanges = {
  image_url: null, status: "keep", order_method: "keep", replace_description: false, description: "",
};
export const targetKey = (products: Pick<AdminProduct, "id">[]) => products.map(p => p.id).sort().join(",");

export function bulkEditSummary(changes: BulkEditChanges, file: File | null): string[] {
  return [
    ...(file || changes.image_url ? ["Replace image with one shared image"] : []),
    ...(changes.status !== "keep" ? [`Set status to ${changes.status}`] : []),
    ...(changes.order_method !== "keep" ? [`Set order method to ${changes.order_method === "whatsapp" ? "WhatsApp Order" : "Normal Checkout"}`] : []),
    ...(changes.replace_description && changes.description.trim() ? ["Replace description"] : []),
  ];
}

// Only these four fields can be written. Blank/untouched descriptions are omitted.
export function bulkEditPayload(changes: BulkEditChanges, metadata: unknown) {
  return {
    ...(changes.image_url ? { image_url: changes.image_url } : {}),
    ...(changes.status !== "keep" ? { is_active: changes.status === "active" } : {}),
    ...(changes.order_method !== "keep" ? { metadata: withOrderMethod(metadata, changes.order_method) } : {}),
    ...(changes.replace_description && changes.description.trim() ? { description: changes.description.trim() } : {}),
  };
}

export type BulkEditResult = {
  completed: string[];
  failedId: string | null;
  error: string | null;
  imageUrl: string | null;
  writeAttempted: boolean;
};

export async function applyBulkEdit(ids: string[], changes: BulkEditChanges, file: File | null,
  types: ProductType[], onProgress: (count: number) => void): Promise<BulkEditResult> {
  const result: BulkEditResult = { completed: [], failedId: null, error: null, imageUrl: changes.image_url, writeAttempted: false };
  try {
    if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length) throw new Error("Choose 1–100 distinct filtered products. Narrow the filters for larger sets.");
    if (!bulkEditSummary(changes, file).length) throw new Error("Choose at least one change.");
    if (changes.image_url && !/^https?:$/.test(new URL(changes.image_url).protocol)) throw new Error("Choose a valid existing image URL.");
    if (file && (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) throw new Error("Choose a PNG, JPG or WEBP up to 5 MB.");

    // Check the full frozen target set before uploading or writing. Never expand a filter at save time.
    const { data: current, error } = await supabase.from("products")
      .select("id, category_id, product_type_id").in("id", ids);
    if (error) throw new Error(error.message);
    if (!current || current.length !== ids.length || !ids.every(id => current.some(p => p.id === id))) throw new Error("Some target products are unavailable. Reload and review the filters again.");
    if (changes.status === "active" && current.some(p => !p.category_id || !types.some(t => t.id === p.product_type_id && t.category_id === p.category_id))) {
      throw new Error("Active products require a Game and a matching Product Type. Fix unassigned products individually first.");
    }

    if (file) {
      const path = `${crypto.randomUUID()}/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() || "jpg"}`;
      const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file, {
        contentType: file.type, cacheControl: "3600", upsert: false,
      });
      if (uploadError) throw new Error(`Image upload was not confirmed. No product updates were attempted. ${uploadError.message}`);
      result.imageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }

    for (const id of ids) {
      result.failedId = id;
      let metadata: unknown = null;
      if (changes.order_method !== "keep") {
        // Match single-product editing: merge with fresh metadata, not the cached catalog.
        const { data: fresh, error: readError } = await supabase.from("products").select("metadata").eq("id", id).maybeSingle();
        if (readError || !fresh) throw new Error(readError?.message ?? "Product is no longer available.");
        metadata = fresh.metadata;
      }
      const payload = bulkEditPayload({ ...changes, image_url: result.imageUrl }, metadata);
      result.writeAttempted = true;
      // Returning an ID distinguishes a confirmed update from a zero-row policy/conflict result.
      const { data: saved, error: saveError } = await supabase.from("products").update(payload).eq("id", id).select("id").maybeSingle();
      if (saveError || !saved || saved.id !== id) throw new Error(saveError?.message ?? "No update was confirmed for this product.");
      result.completed.push(id);
      result.failedId = null;
      onProgress(result.completed.length);
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : "The operation was not confirmed.";
  }
  // Never remove storage files or roll back successful rows: other products/admins may use them.
  return result;
}
