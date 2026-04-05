// Shared auth for admin API routes.
// Matches the existing pattern used in app/api/admin/run-pricing/route.ts:
// allow either `x-sync-secret` header or `Authorization: Bearer <secret>`.

export function isAuthorizedAdmin(req: Request) {
  const headerSecret = req.headers.get("x-sync-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  const expectedSecret = process.env.SYNC_SECRET ?? process.env.CRON_SECRET ?? "";

  return Boolean(
    expectedSecret &&
      (headerSecret === expectedSecret || bearerSecret === expectedSecret)
  );
}

