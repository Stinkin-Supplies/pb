"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { getProductImage, filterImageUrls } from "@/lib/getProductImage";
import {
  HARLEY_CATEGORIES,
  HARLEY_STYLES,
  type HarleyCategory,
  type HarleyStyle,
  getHarleyCategory,
} from "@/lib/harley/config";
import { normalizeHarleyProductRow, type HarleyProduct } from "@/lib/harley/catalog";

type Step = "styles" | "models" | "submodels" | "categories" | "loading";
type SubmodelRow = { submodel: string; model?: string; year?: number };

const YEAR_MIN = 1979;
const YEAR_MAX = new Date().getFullYear();
const YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MAX - i);

const css = `
  *, *::before, *::after { box-sizing: border-box; }
  body { background: #0a0909; color: #f0ebe3; }
  .harley-shell {
    min-height: 100vh;
    background:
      radial-gradient(circle at 20% 0%, rgba(232,98,26,0.18), transparent 32%),
      radial-gradient(circle at 80% 20%, rgba(201,168,76,0.10), transparent 28%),
      linear-gradient(180deg, #070707 0%, #0a0909 45%, #0f0e0d 100%);
    color: #f0ebe3;
    overflow-x: hidden;
  }
  .harley-wrap { max-width: 1440px; margin: 0 auto; padding: 0 20px 72px; }
  .harley-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
    gap: 28px;
    align-items: stretch;
    min-height: calc(100svh - 84px);
    padding: 28px 0 18px;
  }
  .hero-copy {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 18px;
    padding: 10px 0 22px;
  }
  .eyebrow {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.28em;
    color: #e8621a;
    text-transform: uppercase;
  }
  .hero-title {
    font-family: var(--font-caesar), sans-serif;
    font-size: clamp(44px, 6vw, 92px);
    line-height: 0.95;
    letter-spacing: 0.04em;
    max-width: 11ch;
  }
  .hero-title span { color: #e8621a; }
  .hero-sub {
    max-width: 56ch;
    color: #c4c0bc;
    font-size: 15px;
    line-height: 1.7;
  }
  .hero-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  .chip {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    border: 1px solid #2a2828;
    background: rgba(17,16,16,0.72);
    color: #c4c0bc;
    padding: 7px 11px;
    border-radius: 999px;
  }
  .chip.accent {
    color: #f0ebe3;
    border-color: rgba(232,98,26,0.35);
    background: rgba(232,98,26,0.08);
  }
  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .ghost-link, .primary-link, .back-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-decoration: none;
    border-radius: 2px;
    cursor: pointer;
    font-family: var(--font-stencil), monospace;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 12px 16px;
    transition: all 0.18s ease;
  }
  .primary-link {
    color: #0a0909;
    background: #e8621a;
    border: 1px solid #e8621a;
  }
  .ghost-link, .back-link {
    color: #c4c0bc;
    background: rgba(17,16,16,0.8);
    border: 1px solid #2a2828;
  }
  .primary-link:hover, .ghost-link:hover, .back-link:hover {
    transform: translateY(-1px);
    border-color: rgba(232,98,26,0.55);
    color: #f0ebe3;
  }
  .hero-stage {
    position: relative;
    border-left: 1px solid rgba(42,40,40,0.72);
    padding-left: 22px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
  .style-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: auto;
  }
  .style-card {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    padding: 18px 16px;
    border: 1px solid #2a2828;
    background:
      linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)),
      rgba(17,16,16,0.84);
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  }
  .style-card:hover {
    transform: translateY(-3px);
    border-color: rgba(232,98,26,0.45);
    background: rgba(20,19,19,0.95);
  }
  .style-card.active {
    border-color: rgba(232,98,26,0.75);
    box-shadow: 0 0 0 1px rgba(232,98,26,0.15), 0 18px 40px rgba(0,0,0,0.32);
  }
  .style-card::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, transparent, rgba(232,98,26,0.95), transparent);
    opacity: 0.75;
  }
  .style-card-main { min-width: 0; }
  .style-name {
    font-family: var(--font-caesar), sans-serif;
    font-size: 28px;
    line-height: 1;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }
  .style-subtitle {
    color: #8a8784;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .style-models {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
    max-width: 42%;
  }
  .model-pill {
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 5px 8px;
    color: #f0ebe3;
    border: 1px solid rgba(138,135,132,0.26);
    background: rgba(10,9,9,0.55);
    border-radius: 999px;
  }
  .selection-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin: 14px 0 22px;
  }
  .selection-badge {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    border: 1px solid #2a2828;
    background: rgba(17,16,16,0.78);
    padding: 8px 12px;
    border-radius: 999px;
    color: #c4c0bc;
  }
  .selection-badge strong { color: #f0ebe3; }
  .panel {
    border-top: 1px solid #2a2828;
    padding-top: 18px;
    margin-top: 8px;
  }
  .panel-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }
  .panel-title {
    font-family: var(--font-caesar), sans-serif;
    font-size: clamp(24px, 4vw, 38px);
    letter-spacing: 0.04em;
    line-height: 1;
  }
  .panel-kicker {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.18em;
    color: #8a8784;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .rail {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .rail-btn {
    appearance: none;
    border: 1px solid #2a2828;
    background: rgba(17,16,16,0.75);
    color: #c4c0bc;
    font-family: var(--font-stencil), monospace;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 9px;
    padding: 10px 12px;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.18s ease;
  }
  .rail-btn:hover { border-color: rgba(232,98,26,0.45); color: #f0ebe3; transform: translateY(-1px); }
  .rail-btn.active { border-color: rgba(232,98,26,0.85); color: #0a0909; background: #e8621a; }
  .year-select {
    background: #111010;
    color: #f0ebe3;
    border: 1px solid #2a2828;
    font-family: var(--font-stencil), monospace;
    letter-spacing: 0.12em;
    font-size: 10px;
    padding: 11px 12px;
    border-radius: 2px;
    min-width: 128px;
  }
  .submodel-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .submodel-card {
    border: 1px solid #2a2828;
    background: rgba(17,16,16,0.84);
    padding: 16px;
    cursor: pointer;
    transition: all 0.18s ease;
  }
  .submodel-card:hover { border-color: rgba(232,98,26,0.5); transform: translateY(-2px); }
  .submodel-name {
    font-family: var(--font-caesar), sans-serif;
    font-size: 22px;
    letter-spacing: 0.04em;
    line-height: 1.1;
    margin-bottom: 8px;
  }
  .submodel-meta, .category-desc, .product-meta, .modal-meta {
    color: #8a8784;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .category-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .category-card {
    border: 1px solid #2a2828;
    background: rgba(17,16,16,0.82);
    overflow: hidden;
  }
  .category-card button {
    width: 100%;
    text-align: left;
    border: 0;
    background: transparent;
    color: inherit;
    padding: 14px 16px;
    cursor: pointer;
  }
  .category-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px;
  }
  .category-title {
    font-family: var(--font-caesar), sans-serif;
    font-size: 28px;
    line-height: 1;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
  }
  .category-count {
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    letter-spacing: 0.14em;
    color: #e8621a;
    text-transform: uppercase;
    padding-top: 4px;
  }
  .category-body {
    padding: 0 16px 16px;
  }
  .product-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .product-card {
    position: relative;
    border: 1px solid #2a2828;
    background: rgba(10,9,9,0.9);
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.18s ease, border-color 0.18s ease;
  }
  .product-card:hover { transform: translateY(-2px); border-color: rgba(232,98,26,0.45); }
  .product-image {
    position: relative;
    aspect-ratio: 1 / 1;
    background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent);
  }
  .product-info { padding: 10px 10px 12px; }
  .product-name {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
    color: #f0ebe3;
    margin-bottom: 8px;
  }
  .product-price {
    font-family: var(--font-caesar), sans-serif;
    font-size: 22px;
    letter-spacing: 0.03em;
  }
  .product-subrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 6px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #8a8784;
  }
  .badge.good { color: #22c55e; }
  .badge.warn { color: #c9a84c; }
  .corner-nav {
    position: fixed;
    right: 18px;
    top: 110px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 180px;
  }
  .corner-nav button {
    border: 1px solid #2a2828;
    background: rgba(10,9,9,0.8);
    color: #c4c0bc;
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    padding: 8px 10px;
    text-align: left;
    border-radius: 2px;
    cursor: pointer;
  }
  .corner-nav button:hover { border-color: rgba(232,98,26,0.55); color: #f0ebe3; }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.76);
    backdrop-filter: blur(12px);
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .modal {
    width: min(1040px, 100%);
    max-height: min(90svh, 960px);
    overflow: auto;
    border: 1px solid rgba(42,40,40,0.92);
    background:
      radial-gradient(circle at 0% 0%, rgba(232,98,26,0.15), transparent 26%),
      #111010;
    display: grid;
    grid-template-columns: minmax(280px, 0.95fr) minmax(0, 1.05fr);
  }
  .modal-media {
    position: relative;
    min-height: 320px;
    background: #fff;
  }
  .modal-body {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .modal-close {
    align-self: flex-start;
    border: 1px solid #2a2828;
    background: transparent;
    color: #c4c0bc;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 10px 12px;
    cursor: pointer;
  }
  .modal-title {
    font-family: var(--font-caesar), sans-serif;
    font-size: clamp(28px, 4vw, 50px);
    line-height: 0.98;
    letter-spacing: 0.04em;
  }
  .modal-price {
    font-family: var(--font-caesar), sans-serif;
    font-size: 34px;
    color: #e8621a;
  }
  .modal-copy { color: #c4c0bc; line-height: 1.7; font-size: 14px; }
  .modal-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .footer-note {
    margin-top: 28px;
    color: #8a8784;
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .loading-row {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #c4c0bc;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 18px 0;
  }
  .spinner {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 2px solid #2a2828;
    border-top-color: #e8621a;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 1100px) {
    .harley-hero { grid-template-columns: 1fr; min-height: auto; }
    .hero-stage { border-left: 0; padding-left: 0; }
    .corner-nav { display: none; }
  }
  @media (max-width: 900px) {
    .category-list, .product-grid, .submodel-grid { grid-template-columns: 1fr; }
    .modal { grid-template-columns: 1fr; }
    .style-models { max-width: none; justify-content: flex-start; }
  }
`;

function normalizeProduct(product: any): HarleyProduct {
  return normalizeHarleyProductRow(product);
}

function ProductThumb({ product, onOpen }: { product: HarleyProduct; onOpen: (product: HarleyProduct) => void }) {
  const imageSrc = getProductImage({ image: product.image_url ?? null, images: filterImageUrls(product.image_urls ?? []), brand: product.brand });
  return (
    <motion.div
      layout
      className="product-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
      onClick={() => onOpen(product)}
    >
      <motion.div className="product-image" layoutId={`product-image-${product.id}`}>
        <Image
          src={imageSrc}
          alt={product.name}
          fill
          sizes="(max-width: 900px) 100vw, 20vw"
          style={{ objectFit: "contain", padding: 10 }}
          unoptimized
        />
      </motion.div>
      <div className="product-info">
        <div className="product-name">{product.name}</div>
        <div className="product-subrow">
          <div className="product-price">${Number(product.price || 0).toFixed(2)}</div>
          <div className={`badge ${product.in_stock ? "good" : "warn"}`}>
            {product.in_stock ? "In Stock" : "Notify Me"}
          </div>
        </div>
        <div className="product-meta">{product.brand} · {product.category}</div>
      </div>
    </motion.div>
  );
}

function ExpandableCategoryCard({
  category,
  products,
  expanded,
  onToggle,
  onOpenProduct,
}: {
  category: HarleyCategory;
  products: HarleyProduct[];
  expanded: boolean;
  onToggle: () => void;
  onOpenProduct: (product: HarleyProduct) => void;
}) {
  return (
    <motion.section
      layout
      id={`category-${category.slug}`}
      className="category-card"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <button onClick={onToggle}>
        <div className="category-head">
          <div>
            <div className="category-title">{category.label}</div>
            <div className="category-desc">{category.description}</div>
          </div>
          <div className="category-count">{products.length.toLocaleString()} items</div>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="category-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            {products.length > 0 ? (
              <div className="product-grid">
                {products.slice(0, 6).map(product => (
                  <ProductThumb key={product.id} product={product} onOpen={onOpenProduct} />
                ))}
              </div>
            ) : (
              <div className="loading-row">
                <div className="spinner" />
                No products loaded for this category yet.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function CornerNav({
  categories,
  onJump,
}: {
  categories: HarleyCategory[];
  onJump: (slug: string) => void;
}) {
  if (categories.length === 0) return null;

  return (
    <motion.aside
      className="corner-nav"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      {categories.map(category => (
        <button key={category.slug} onClick={() => onJump(category.slug)}>
          {category.label}
        </button>
      ))}
    </motion.aside>
  );
}

function ProductModal({
  product,
  onClose,
}: {
  product: HarleyProduct | null;
  onClose: () => void;
}) {
  const imageSrc = product
    ? getProductImage({
        image: product.image_url ?? null,
        images: filterImageUrls(product.image_urls ?? []),
        brand: product.brand,
      })
    : null;

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal"
            initial={{ scale: 0.97, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, y: 20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
          >
            <motion.div className="modal-media" layoutId={product ? `product-image-${product.id}` : undefined}>
              {imageSrc && (
                <Image
                  src={imageSrc}
                  alt={product.name}
                  fill
                  sizes="(max-width: 900px) 100vw, 45vw"
                  style={{ objectFit: "contain", padding: 18 }}
                  unoptimized
                />
              )}
            </motion.div>
            <div className="modal-body">
              <button className="modal-close" onClick={onClose}>Close</button>
              <div className="modal-meta">{product.brand} · {product.category}</div>
              <div className="modal-title">{product.name}</div>
              <div className="modal-price">${Number(product.price || 0).toFixed(2)}</div>
              <div className="modal-copy">
                {product.description || "Unified Harley catalog result. Use this modal to inspect the part before jumping to the PDP."}
              </div>
              <div className="hero-summary">
                <span className={`chip ${product.in_stock ? "accent" : ""}`}>
                  {product.in_stock ? "In Stock" : "Out of Stock"}
                </span>
                <span className="chip">SKU {product.sku}</span>
                {product.fitment_year_start && (
                  <span className="chip">
                    {product.fitment_year_start}
                    {product.fitment_year_end && product.fitment_year_end !== product.fitment_year_start
                      ? `–${product.fitment_year_end}`
                      : ""}
                  </span>
                )}
              </div>
              <div className="modal-actions">
                <Link href={`/shop/${product.slug}`} className="primary-link">Open PDP</Link>
                <button className="ghost-link" onClick={onClose}>Keep Browsing</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function HarleySearchClient({ initialStyles }: { initialStyles: HarleyStyle[] }) {
  const [step, setStep] = useState<Step>("styles");
  const [selectedStyle, setSelectedStyle] = useState<HarleyStyle | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(YEAR_MAX);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [submodels, setSubmodels] = useState<SubmodelRow[]>([]);
  const [productsByCategory, setProductsByCategory] = useState<Record<string, HarleyProduct[]>>({});
  const [selectedProduct, setSelectedProduct] = useState<HarleyProduct | null>(null);
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const styles = initialStyles.length > 0 ? initialStyles : HARLEY_STYLES;
  const models = selectedStyle?.generic_models ?? [];
  const categories = useMemo(
    () => (selectedStyle?.categories?.length ? selectedStyle.categories : HARLEY_CATEGORIES.map(c => c.slug))
      .map(slug => getHarleyCategory(slug))
      .filter(Boolean) as HarleyCategory[],
    [selectedStyle]
  );

  useEffect(() => {
    if (categories.length > 0 && openCategories.length === 0 && step === "categories") {
      setOpenCategories(categories.slice(0, 2).map(c => c.slug));
    }
  }, [categories, openCategories.length, step]);

  const resetToStyles = () => {
    startTransition(() => {
      setStep("styles");
      setSelectedStyle(null);
      setSelectedModel(null);
      setSubmodels([]);
      setProductsByCategory({});
      setOpenCategories([]);
      setSelectedProduct(null);
      setError(null);
    });
  };

  const loadCategoryProducts = async ({
    genericModel,
    submodel,
  }: {
    genericModel: string;
    submodel?: string | null;
  }) => {
    const selectedCategories = categories.length > 0 ? categories : HARLEY_CATEGORIES;
    setLoading(true);
    setError(null);
    try {
      const queryRoute = submodel ? "exact-products" : "products";
      const responses = await Promise.all(selectedCategories.map(async category => {
        const params = new URLSearchParams({
          year: String(selectedYear),
          category: category.label,
        });
        if (submodel) {
          params.set("submodel", submodel);
        } else {
          params.set("generic", genericModel);
        }

        const res = await fetch(`/api/harley2/${queryRoute}?${params.toString()}`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : data.products ?? [];
        return [category.slug, rows.map(normalizeProduct)] as const;
      }));

      setProductsByCategory(Object.fromEntries(responses));
      setOpenCategories(selectedCategories.slice(0, 2).map(c => c.slug));
      setStep("categories");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStyle = async (style: HarleyStyle) => {
    startTransition(() => {
      setSelectedStyle(style);
      setSelectedModel(null);
      setSubmodels([]);
      setProductsByCategory({});
      setOpenCategories([]);
      setSelectedProduct(null);
      setStep("models");
    });
  };

  const handleSelectModel = async (model: string) => {
    setSelectedModel(model);
    setSelectedProduct(null);
    setError(null);
    setLoading(true);

    try {
      const params = new URLSearchParams({
        generic: model,
        year: String(selectedYear),
      });
      const res = await fetch(`/api/harley2/submodels?${params.toString()}`);
      const data = await res.json();
      const rows = Array.isArray(data) ? data : data.submodels ?? [];

      if (rows.length > 0) {
        setSubmodels(rows);
        setStep("submodels");
      } else {
        await loadCategoryProducts({ genericModel: model });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fitment");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSubmodel = async (row: SubmodelRow) => {
    if (!selectedModel) return;
    setLoading(true);
    setSelectedProduct(null);
    try {
      await loadCategoryProducts({ genericModel: selectedModel, submodel: row.submodel });
    } finally {
      setLoading(false);
    }
  };

  const visibleStyles = step === "styles" ? styles : styles;

  return (
    <div className="harley-shell">
      <style>{css}</style>
      <NavBar activePage="shop" cartCount={0} onCartClick={() => {}} />
      <div className="harley-wrap">
        <motion.section
          className="harley-hero"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          <div className="hero-copy">
            <div>
              <div className="eyebrow">UNIFIED SHOP / HARLEY-FIRST EXPERIENCE</div>
              <h1 className="hero-title">
                Fit <span>Harley</span> parts by style, model, and submodel.
              </h1>
            </div>
            <p className="hero-sub">
              One catalog. Two vendors only. Duplicates are collapsed through the unified catalog,
              while exact fitment starts with style selection and drills down to the bike you actually own.
            </p>
            <div className="hero-summary">
              <span className="chip accent">PU Oldbook + Fatbook</span>
              <span className="chip accent">WPS HardDrive</span>
              <span className="chip">Exact submodel fitment</span>
              <span className="chip">Shared layout product detail</span>
            </div>
            <div className="hero-actions">
              <button className="primary-link" onClick={resetToStyles}>Start with Styles</button>
              <Link href="/shop/classic" className="ghost-link">Classic Shop</Link>
            </div>
            <div className="footer-note">
              Current selection: {selectedStyle ? selectedStyle.display_name : "none"} · {selectedYear}
            </div>
          </div>

          <div className="hero-stage">
            <div className="style-stack">
              {visibleStyles.map((style, index) => {
                const active = selectedStyle?.style_name === style.style_name;
                return (
                  <motion.button
                    key={style.style_name}
                    className={`style-card${active ? " active" : ""}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: index * 0.03 }}
                    onClick={() => handleSelectStyle(style)}
                  >
                    <div className="style-card-main">
                      <div className="style-name">{style.display_name}</div>
                      <div className="style-subtitle">{style.subtitle}</div>
                    </div>
                    <div className="style-models">
                      {style.generic_models.slice(0, 5).map(model => (
                        <span key={model} className="model-pill">{model}</span>
                      ))}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </motion.section>

        <div className="selection-bar">
          <span className="selection-badge">Step <strong>{step}</strong></span>
          <span className="selection-badge">Year <strong>{selectedYear}</strong></span>
          {selectedModel && <span className="selection-badge">Model <strong>{selectedModel}</strong></span>}
          {submodels.length > 0 && step === "submodels" && (
            <span className="selection-badge">Exact choices <strong>{submodels.length}</strong></span>
          )}
          {loading && (
            <span className="selection-badge" style={{ color: "#e8621a" }}>Loading…</span>
          )}
          {error && (
            <span className="selection-badge" style={{ color: "#ef4444" }}>{error}</span>
          )}
        </div>

        {step === "models" && selectedStyle && (
          <motion.section className="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <div className="panel-head">
              <div>
                <div className="panel-kicker">STYLE SELECTED</div>
                <div className="panel-title">{selectedStyle.display_name} models</div>
              </div>
              <select
                className="year-select"
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
              >
                {YEARS.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            <div className="rail">
              {models.map(model => (
                <button
                  key={model}
                  className={`rail-btn${selectedModel === model ? " active" : ""}`}
                  onClick={() => handleSelectModel(model)}
                >
                  {model}
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {step === "submodels" && (
          <motion.section className="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <div className="panel-head">
              <div>
                <div className="panel-kicker">EXACT MODEL MATCHES</div>
                <div className="panel-title">{selectedModel} · {selectedYear}</div>
              </div>
              <button className="back-link" onClick={() => setStep("models")}>Back to models</button>
            </div>
            <div className="submodel-grid">
              {submodels.map(row => (
                <button
                  key={row.submodel}
                  className="submodel-card"
                  onClick={() => handleSelectSubmodel(row)}
                >
                  <div className="submodel-name">{row.submodel}</div>
                  <div className="submodel-meta">
                    {row.year ?? selectedYear} · {row.model ?? selectedModel}
                  </div>
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {step === "categories" && (
          <motion.section className="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <div className="panel-head">
              <div>
                <div className="panel-kicker">SHOP BY CATEGORY</div>
                <div className="panel-title">
                  {selectedStyle?.display_name ?? "Harley"} · {selectedYear}
                </div>
              </div>
              <div className="hero-actions">
                <button className="back-link" onClick={() => setStep("models")}>Back to models</button>
                <button className="back-link" onClick={resetToStyles}>Change style</button>
              </div>
            </div>

            <LayoutGroup>
              <div className="category-list">
                {categories.map(category => (
                  <ExpandableCategoryCard
                    key={category.slug}
                    category={category}
                    products={productsByCategory[category.slug] ?? []}
                    expanded={openCategories.includes(category.slug)}
                    onToggle={() => {
                      setOpenCategories(prev =>
                        prev.includes(category.slug)
                          ? prev.filter(value => value !== category.slug)
                          : [...prev, category.slug]
                      );
                    }}
                    onOpenProduct={setSelectedProduct}
                  />
                ))}
              </div>
            </LayoutGroup>

            <CornerNav
              categories={categories}
              onJump={slug => document.getElementById(`category-${slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            />
          </motion.section>
        )}

        {step === "loading" && (
          <div className="loading-row">
            <div className="spinner" />
            Loading fitment and products...
          </div>
        )}
      </div>

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}
