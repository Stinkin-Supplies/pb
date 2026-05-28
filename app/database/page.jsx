import { getDatabaseSnapshot } from "@/lib/db/databaseSnapshot";
import DatabaseSnapshotView from "@/components/database/DatabaseSnapshotView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PublicDatabasePage() {
  const snapshot = await getDatabaseSnapshot({ includeTableStats: false });
  return <DatabaseSnapshotView snapshot={snapshot} variant="public" />;
}
