"use server";

import { getCatalogDb } from "@/lib/db/catalog";
import { revalidatePath } from "next/cache";

export async function updateProduct(id, formData) {
  const db = getCatalogDb();

  const fields = {
    internal_sku:    formData.get("internal_sku"),
    name:            formData.get("name"),
    brand:           formData.get("brand"),
    display_brand:   formData.get("display_brand"),
    category:        formData.get("category"),
    subcategory:     formData.get("subcategory"),
    description:     formData.get("description"),
    msrp:            formData.get("msrp")      || null,
    cost:            formData.get("cost")       || null,
    map_price:       formData.get("map_price")  || null,
    computed_price:  formData.get("computed_price") || null,
    upc:             formData.get("upc"),
    weight:          formData.get("weight")     || null,
    is_active:       formData.get("is_active") === "true",
    is_discontinued: formData.get("is_discontinued") === "true",
    has_map_policy:  formData.get("has_map_policy") === "true",
    is_universal:    formData.get("is_universal") === "true",
    is_harley_fitment: formData.get("is_harley_fitment") === "true",
    image_url:       formData.get("image_url"),
    slug:            formData.get("slug"),
  };

  await db.query(
    `UPDATE public.catalog_unified SET
      internal_sku    = $1,
      name            = $2,
      brand           = $3,
      display_brand   = $4,
      category        = $5,
      subcategory     = $6,
      description     = $7,
      msrp            = $8,
      cost            = $9,
      map_price       = $10,
      computed_price  = $11,
      upc             = $12,
      weight          = $13,
      is_active       = $14,
      is_discontinued = $15,
      has_map_policy  = $16,
      is_universal    = $17,
      is_harley_fitment = $18,
      image_url       = $19,
      slug            = $20,
      updated_at      = NOW()
    WHERE id = $21`,
    [
      fields.internal_sku,
      fields.name,
      fields.brand,
      fields.display_brand,
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
      fields.image_url,
      fields.slug,
      id,
    ]
  );

  revalidatePath(`/admin/products/${id}`);
  revalidatePath("/admin/products");
}