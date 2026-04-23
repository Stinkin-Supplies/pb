/**
 * app/api/admin/products/[id]/route.ts
 * PATCH — update category / subcategory on catalog_unified and catalog_products
 */

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const productId = parseInt(id);
  if (isNaN(productId)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }

  const body = await req.json();
  const { category, subcategory } = body;

  if (!category) {
    return NextResponse.json({ error: "category required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Update catalog_unified (denormalized table)
    await client.query(
      `UPDATE catalog_unified
       SET category = $1, subcategory = $2
       WHERE id = $3`,
      [category, subcategory ?? null, productId]
    );

    // Also update catalog_products (source of truth) if the row exists
    await client.query(
      `UPDATE catalog_products
       SET category = $1, subcategory = $2
       WHERE id = $3`,
      [category, subcategory ?? null, productId]
    );

    await client.query("COMMIT");
    return NextResponse.json({ updated: true, category, subcategory });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Admin product PATCH error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}