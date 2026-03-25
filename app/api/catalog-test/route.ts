import { NextResponse } from 'next/server'
import getCatalogDb from '@/lib/db/catalog'

export async function GET() {
  const db = getCatalogDb()
  const { rows } = await db.query('SELECT COUNT(*) FROM products')
  return NextResponse.json({ count: rows[0].count })
}