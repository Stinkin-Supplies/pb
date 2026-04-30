"use server";

import { getCatalogDb } from "@/lib/db/catalog";
import { revalidatePath } from "next/cache";

export async function updateProduct(id, formData) {
  const db = getCatalogDb();

  const fields = {
    internal_sku:      formData.get("internal_sku"),
    name:              formData.get("name"),
    brand:             formData.get("brand"),
    category:          formData.get("category"),
    subcategory:       formData.get("subcategory"),
    description:       formData.get("description"),
    msrp:              formData.get("msrp")          || null,
    cost:              formData.get("cost")           || null,
    map_price:         formData.get("map_price")      || null,
    computed_price:    formData.get("computed_price") || null,
    upc:               formData.get("upc"),
    weight:            formData.get("weight")         || null,
    is_active:         formData.get("is_active")         === "true",
    is_discontinued:   formData.get("is_discontinued")   === "true",
    has_map_policy:    formData.get("has_map_policy")    === "true",
    is_universal:      formData.get("is_universal")      === "true",
    is_harley_fitment: formData.get("is_harley_fitment") === "true",
    drag_part:         formData.get("drag_part")         === "true",
    closeout:          formData.get("closeout")          === "true",
    image_url:         formData.get("image_url"),
    slug:              formData.get("slug"),
  };

  await db.query(
    `UPDATE public.catalog_unified SET
      internal_sku      = $1,
      name              = $2,
      brand             = $3,
      category          = $4,
      subcategory       = $5,
      description       = $6,
      msrp              = $7,
      cost              = $8,
      map_price         = $9,
      computed_price    = $10,
      upc               = $11,
      weight            = $12,
      is_active         = $13,
      is_discontinued   = $14,
      has_map_policy    = $15,
      is_universal      = $16,
      is_harley_fitment = $17,
      drag_part         = $18,
      closeout          = $19,
      image_url         = $20,
      slug              = $21,
      updated_at        = NOW()
    WHERE id = $22`,
    [
      fields.internal_sku,
      fields.name,
      fields.brand,
      fields.category,
      fields.subcategory,
      fields.description,
      fields.msrp,
      fields.cost,
      fields.map_price,
      fields.computed_price,
      fields.upc,
      fields.weight,
      fields.is_active,
      fields.is_discontinued,
      fields.has_map_policy,
      fields.is_universal,
      fields.is_harley_fitment,
      fields.drag_part,
      fields.closeout,
      fields.image_url,
      fields.slug,
      id,
    ]
  );

  revalidatePath(`/admin/products/${id}`);
  revalidatePath("/admin/products");
}