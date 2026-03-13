"use client";

import { useState } from "react";

/* =========================
   TYPES
========================= */

type Product = {
  id: number
  brand: string
  name: string
  price: number
  was?: number
  badge?: string
  fits: boolean
}

type Bike = {
  year: number
  make: string
  model: string
} | null

type Category = {
  name: string
  count: string
  icon: string
}

/* =========================
   DATA
========================= */

const YEARS = Array.from({ length: 30 }, (_, i) => 2025 - i)

const MAKES = [
  "Harley-Davidson",
  "Indian",
  "Honda",
  "Yamaha",
  "Kawasaki",
  "Suzuki",
  "BMW",
  "KTM",
  "Ducati",
  "Triumph",
]

const MODELS: Record<string, string[]> = {
  "Harley-Davidson": [
    "Road King",
    "Street Glide",
    "Fat Boy",
    "Sportster S",
    "Road Glide",
    "Softail Slim",
    "Fat Bob",
    "Low Rider",
  ],
  Indian: ["Chief", "Scout", "Challenger", "Springfield", "Pursuit"],
  Honda: ["Gold Wing", "Shadow", "Rebel 500", "CBR1000RR", "Africa Twin"],
}

const PRODUCTS: Product[] = [
  {
    id: 1,
    brand: "Screamin Eagle",
    name: "Stage IV High Torque Kit",
    price: 849.99,
    was: 999.99,
    badge: "sale",
    fits: true,
  },
  {
    id: 2,
    brand: "Vance & Hines",
    name: "Pro Pipe Chrome Exhaust System",
    price: 524.95,
    badge: "new",
    fits: true,
  },
  {
    id: 3,
    brand: "Arlen Ness",
    name: "Beveled Air Cleaner Kit — Chrome",
    price: 189.95,
    fits: false,
  },
]

const CATEGORIES: Category[] = [
  { name: "Engine & Performance", count: "4,820 parts", icon: "/icons/engine.svg" },
  { name: "Exhaust Systems", count: "2,140 parts", icon: "/icons/exhaust.svg" },
  { name: "Lighting & Electrical", count: "3,560 parts", icon: "/icons/lighting-electrical.svg" },
  { name: "Body & Fenders", count: "1,890 parts", icon: "/icons/fender_frame.svg" },
]

/* =========================
   COMPONENTS
========================= */

type ProductCardProps = {
  p: Product
  bike: Bike
}

function ProductCard({ p, bike }: ProductCardProps) {
  return (
    <div className="product-card">
      <div className="product-img">
        <span className="product-img-placeholder mono">NO IMAGE</span>

        {p.badge && (
          <span className={`product-badge ${p.badge}`}>
            {p.badge.toUpperCase()}
          </span>
        )}
      </div>

      <div className="product-body">
        <div className="product-brand">{p.brand}</div>

        <div className="product-name">{p.name}</div>

        {bike && p.fits && (
          <div className="product-fits mono">
            ✓ FITS YOUR {bike.year} {bike.make}
          </div>
        )}

        <div className="product-footer">
          <div className="product-price">
            {p.was && <span className="was">${p.was}</span>}
            ${p.price.toFixed(2)}
          </div>

          <button className="product-add">ADD</button>
        </div>
      </div>
    </div>
  )
}

type CategoryCardProps = {
  cat: Category
}

function CategoryCard({ cat }: CategoryCardProps) {
  return (
    <div className="cat-card">
      <div className="cat-icon-wrap">
        <img src={cat.icon} alt={cat.name} className="cat-icon-img" />
      </div>

      <div className="cat-info">
        <div className="cat-name">{cat.name}</div>
        <div className="cat-count">{cat.count}</div>
      </div>
    </div>
  )
}

/* =========================
   PAGE
========================= */

export default function HomePage() {
  const [year, setYear] = useState<number | "">("")
  const [make, setMake] = useState<string>("")
  const [model, setModel] = useState<string>("")

  const [bike, setBike] = useState<Bike>(null)

  const models = make ? MODELS[make] || [] : []

  function selectBike() {
    if (year === "" || !make || !model) return

    setBike({
      year,
      make,
      model,
    })
  }

  return (
    <main>

      {/* HERO */}
      <section>

        <h1>STINKIN' SUPPLIES</h1>

        <div>

          <select
            value={year}
            onChange={(e) => {
              const val = Number(e.target.value)
              setYear(val)
              setMake("")
              setModel("")
            }}
          >
            <option value="">Year</option>

            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            value={make}
            onChange={(e) => {
              setMake(e.target.value)
              setModel("")
            }}
            disabled={!year}
          >
            <option value="">Make</option>

            {MAKES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={!make}
          >
            <option value="">Model</option>

            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <button onClick={selectBike}>Find My Parts</button>

          {bike && (
            <p>
              Selected Bike: {bike.year} {bike.make} {bike.model}
            </p>
          )}
        </div>
      </section>

      {/* PRODUCTS */}

      <section>

        <h2>Featured Parts</h2>

        <div className="products-grid">

          {PRODUCTS.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              bike={bike}
            />
          ))}

        </div>

      </section>

      {/* CATEGORIES */}

      <section>

        <h2>Categories</h2>

        <div className="categories-grid">

          {CATEGORIES.map((c, i) => (
            <CategoryCard
              key={i}
              cat={c}
            />
          ))}

        </div>

      </section>

    </main>
  )
}