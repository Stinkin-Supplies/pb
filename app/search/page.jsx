cat > /Users/home/Desktop/Stinkin-Supplies/app/search/page.jsx << 'EOF'
import SearchClient from "./SearchClient.jsx";

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
EOF