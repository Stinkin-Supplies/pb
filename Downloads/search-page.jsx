// ============================================================
// app/search/page.jsx  —  SERVER COMPONENT
// ============================================================
// Handles /search?q=air+cleaner
//
// TODO Phase 5 (Typesense live):
//   Replace mock search with:
//   const results = await typesense
//     .collections("products")
//     .documents()
//     .search({ q, query_by: "name,brand,description", per_page: 48 });
// ============================================================

import SearchClient from "./SearchClient";

export default async function SearchPage({ searchParams }) {
  const sp    = await searchParams;
  const query = sp?.q ?? "";

  return <SearchClient initialQuery={query} />;
}

export async function generateMetadata({ searchParams }) {
  const sp    = await searchParams;
  const query = sp?.q ?? "";
  return {
    title: query
      ? `Search: "${query}" | Stinkin' Supplies`
      : "Search Parts | Stinkin' Supplies",
  };
}
