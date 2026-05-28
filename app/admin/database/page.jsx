import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDatabaseSnapshot } from "@/lib/db/databaseSnapshot";
import DatabaseSnapshotView from "@/components/database/DatabaseSnapshotView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminDatabasePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/admin/database");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/garage");

  const snapshot = await getDatabaseSnapshot({ includeTableStats: true });
  return <DatabaseSnapshotView snapshot={snapshot} variant="admin" />;
}
