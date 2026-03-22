// ============================================================
// scripts/importWpsTaxonomyTerms.ts
// ============================================================
// Pulls WPS taxonomy terms and stores them in Supabase.
//
// Usage:
//   npx dotenv-cli -e .env.local -- npx ts-node scripts/importWpsTaxonomyTerms.ts
//   npx dotenv-cli -e .env.local -- npx ts-node scripts/importWpsTaxonomyTerms.ts --max-pages 10
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { WpsClient, paginateAll } = require("../lib/vendors/wps.ts");

const args = process.argv.slice(2);
const maxPagesArg = args.indexOf("--max-pages");
const maxPages = maxPagesArg !== -1 ? Number(args[maxPagesArg + 1]) : undefined;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type WpsTaxonomyTerm = {
  id: number;
  vocabulary_id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  link: string | null;
  link_target_blank: boolean;
  left: number | null;
  right: number | null;
  depth: number | null;
  created_at: string | null;
  updated_at: string | null;
};

async function main() {
  const wps = new WpsClient();
  const stats = { total: 0, upserted: 0, errors: 0 };

  await paginateAll<WpsTaxonomyTerm>(
    wps,
    "/taxonomyterms",
    { "page[size]": "200" },
    async (items, pageNum) => {
      stats.total += items.length;

      if (items.length === 0) return;

      const rows = items.map((t) => ({
        id:                t.id,
        vocabulary_id:     t.vocabulary_id,
        parent_id:         t.parent_id ?? null,
        name:              t.name,
        slug:              t.slug,
        description:       t.description ?? null,
        link:              t.link ?? null,
        link_target_blank: Boolean(t.link_target_blank),
        left:              t.left ?? null,
        right:             t.right ?? null,
        depth:             t.depth ?? null,
        wps_created_at:    t.created_at ?? null,
        wps_updated_at:    t.updated_at ?? null,
        raw:               t,
        updated_at:        new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("wps_taxonomy_terms")
        .upsert(rows, { onConflict: "id" });

      if (error) {
        console.error("[WPS Taxonomy] Upsert error:", error.message);
        stats.errors += rows.length;
      } else {
        stats.upserted += rows.length;
      }

      if (pageNum % 10 === 0) {
        console.log(
          `[WPS Taxonomy] Page ${pageNum} — total: ${stats.total.toLocaleString()} | upserted: ${stats.upserted.toLocaleString()}`
        );
      }
    },
    { maxPages }
  );

  console.log("[WPS Taxonomy] Done", stats);
}

main().catch((err) => {
  console.error("[WPS Taxonomy] Fatal:", err.message);
  process.exit(1);
});
