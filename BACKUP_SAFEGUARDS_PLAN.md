# Backup & Safeguards Plan

**Status:** proposed, not yet implemented. Written 2026-07-24.

## Why this exists

On 2026-07-18, `catalog_unified` was `TRUNCATE`d to zero rows by
`scripts/ingest/merge_catalog_unified.js` — a script with no dry-run, no
transaction, and no `--apply` guard. The `CASCADE` wiped every table with a
live foreign key into `catalog_unified` along with it. Full incident and
recovery writeup: `CATALOG_RECOVERY_PLAN.md`.

Recovery worked, but it worked **by luck**, not by backup:
- The three vendor source tables (`pu_catalog`, `wps_catalog`,
  `vtwin_catalog`) happened not to be in the CASCADE path and survived
  untouched.
- Category/subcategory/fitment data was rebuilt from a Typesense search
  index snapshot that happened to still exist — not from a database backup.
- There was no point-in-time restore available. If the vendor tables or the
  Typesense snapshot had also been gone, the catalog would have been
  unrecoverable.

Today, `backups/` contains a handful of manual, ad-hoc dumps (filenames
like `pre_stripattr_fix`, `pre_bare_decimal_size` — snapshots someone
remembered to take before a specific risky operation). There is no
schedule, no retention policy, no off-box copy, and no process that has
ever been tested by actually restoring from one of these files.

This plan closes that gap — for the catalog database specifically, and for
the safeguards that stop a bad script from needing a restore in the first
place.

## Current state (verified 2026-07-24)

- **Catalog Postgres**: self-hosted on Hetzner. No managed automatic
  backups — nothing runs unless someone runs `pg_dump` by hand.
- **Supabase** (auth/orders/cart/audit log): managed, but the actual backup
  tier/retention on the current plan hasn't been confirmed. Needs a check
  in the Supabase dashboard, not something visible from the codebase.
- **App DB role**: `lib/db/catalog.ts` connects with a single connection
  string / single role that has full write access, including
  `TRUNCATE`/`DROP`. There is no separate least-privilege role for routine
  app queries vs. a separate admin role for migrations. `CATALOG_RECOVERY_
  PLAN.md` already flagged this ("DB-level permission separation... needs
  Postgres superuser access on the Hetzner box — proposed, not done").
- **Script safety convention**: CLAUDE.md documents "most ingest scripts
  default to dry-run; pass `--apply` to write" — but this is a convention,
  not an enforced rule. The script that caused the incident simply didn't
  follow it, and nothing would have caught that before it ran.
- **Admin auth**: `lib/adminAuth.ts` is a single shared-secret check
  (`SYNC_SECRET`/`CRON_SECRET`) for admin API routes — no per-action
  confirmation, no audit trail of who triggered what.

## Plan

### 1. Automated catalog backups (highest priority)

The catalog DB is the thing that already got wiped once. It needs a real
backup process before anything else here.

- Add a scheduled job (cron on the Hetzner box, or a Vercel Cron Function
  hitting a protected API route that shells out to `pg_dump`) that runs
  `pg_dump --format=custom` on `CATALOG_DATABASE_URL` daily.
- Store dumps **off the Hetzner box** — e.g. push to a cheap object store
  (Backblaze B2, Cloudflare R2, or S3) immediately after each dump. A
  backup that lives on the same disk as the database doesn't protect
  against disk failure, and wouldn't have helped if the TRUNCATE had also
  corrupted the filesystem.
- Retention: keep daily dumps for 14 days, weekly for 8 weeks, monthly for
  6 months. Prune older ones automatically so this doesn't grow unbounded.
- Stop treating `backups/` in the repo as the backup mechanism — it's
  untracked-by-convention, lives on one laptop, and (per the file audit
  earlier this session) already had a 192MB untracked dump sitting in it
  with no cleanup policy. Real backups belong in object storage, not the
  working directory.

### 2. Backup verification

An unverified backup is a guess, not a backup. Recovery this time relied on
data nobody had confirmed was restorable.

- Monthly (automatable): spin up a scratch Postgres instance, restore the
  latest dump into it, and run a small sanity check script — row counts on
  the tables in the "Key Database Tables" list in CLAUDE.md, spot-check a
  known product ID, confirm `catalog_oem_crossref` and `catalog_fitment_v2`
  aren't empty. Alert if the restore fails or counts look wrong.

### 3. Least-privilege database roles

Directly addresses the "proposed, not done" item from the recovery plan.

- Create a Postgres role for the app's routine `CATALOG_DATABASE_URL`
  connection that can `SELECT`/`INSERT`/`UPDATE` but **cannot** `TRUNCATE`,
  `DROP`, or `DELETE` without a `WHERE` clause being possible to bypass.
  (Postgres can't restrict "DELETE must have a WHERE," but revoking
  `TRUNCATE` outright is straightforward and would have prevented the
  actual incident.)
- Keep a separate, more privileged role for migrations and maintenance
  scripts, used explicitly (e.g. a different env var,
  `CATALOG_MIGRATION_DATABASE_URL`) rather than the default. Ingest scripts
  that need real DDL/TRUNCATE power opt into the dangerous role instead of
  it being the default for everything.
- Needs Hetzner box superuser access, which you've previously offered —
  this is the point to use it.

### 4. Enforce the dry-run convention instead of just documenting it

The dry-run-by-default pattern already exists as a convention (CLAUDE.md);
it just wasn't enforced, and it takes one script written outside the
pattern to cause the exact incident that already happened.

- Add a small shared helper (`scripts/lib/guardedQuery.mjs` or similar)
  that any ingest script must import to run `TRUNCATE`/unscoped `DELETE`.
  It should: require `--apply` explicitly, print the row count that will
  be affected and require it to be non-trivially small OR require a second
  `--yes-i-am-sure` flag above some threshold, and wrap the operation in a
  transaction.
- Add the same row-count sanity check to `sync_catalog_unified.mjs` and any
  other script that already touches `catalog_unified` in bulk — refuse to
  proceed if the operation would change more than, say, 20% of the table's
  rows without an explicit override.
- This is cheap insurance: it would have stopped the July 18 incident
  outright, regardless of whether backups existed.

### 5. Application-level safeguards

- Audit log: Supabase already has an `audit_log` table per CLAUDE.md.
  Confirm it's actually wired into the admin routes and destructive
  catalog operations, not just orders — right now there's no record of
  *who* ran a given ingest script or admin action.
  - **What "wired in" means concretely:** every route in `lib/adminAuth.ts`'s
    protected set, and every ingest script that reaches `--apply`, writes a
    row to `audit_log` (actor, action, table/row-count affected,
    timestamp) *before* the destructive operation runs, not after — so a
    crash mid-operation still leaves a trace.
- Admin routes currently rely on a single shared secret
  (`SYNC_SECRET`/`CRON_SECRET`). Consider per-admin-user auth (Supabase
  auth + `role = 'admin'`, which the main admin panel already uses per
  CLAUDE.md) for anything destructive, so actions are attributable to a
  person, not "whoever has the secret."
- For genuinely destructive admin actions (bulk delete, catalog resync),
  add a confirmation step that shows the row count about to be affected
  before committing — the same principle as item 4, at the UI layer.

### 6. Git hygiene

Not backup in the database sense, but the same category of "avoid losing
work by accident":

- This session found and fixed a corrupted git ref
  (`.git/refs/remotes/origin/main 2`) that was silently breaking any tool
  walking all refs, and cleared out stale `refs/original/*` safety-net refs
  left over from a past history rewrite. Worth a periodic `git fsck` check
  rather than discovering corruption incidentally.
- `CATALOG_RECOVERY_PLAN.md` noted 428 uncommitted files at one point
  during recovery. Uncommitted recovery/ingest work is itself a single
  point of failure — commit ingest scripts as they're built, not in one
  giant batch after the fact.

### 7. Monitoring

- A lightweight scheduled check (could piggyback on the backup-verification
  job) that queries row counts on the core tables and alerts (email/Slack
  webhook) if any of them drop by more than some threshold since the last
  check. This turns "found out three days later" into "found out within an
  hour," which is the difference between a quick rollback and a recovery
  project like the one just finished.

## Suggested rollout order

1. **Automated off-box catalog backups** (item 1) — the single highest-
   leverage item; directly prevents "recovery by luck" from being the only
   option next time.
2. **Enforce dry-run/guardrails** (item 4) — cheapest to build, and would
   have prevented the actual incident regardless of backups existing.
3. **Least-privilege DB roles** (item 3) — needs Hetzner superuser access,
   so sequence it once you're ready to hand that over.
4. **Backup verification** (item 2) — do this right after item 1 ships, not
   as an afterthought; an unverified backup process is easy to set up and
   forget.
5. **Row-count monitoring** (item 7) — small addition once items 1-2 exist.
6. **Audit log wiring + per-admin auth** (item 5) — can happen in parallel
   with the above, lower urgency since it doesn't prevent data loss, just
   improves attribution after the fact.

## Open questions for you

- Where should off-box backups live — do you already have an S3/R2/B2
  account, or should we set one up?
- Do you want the backup/verification jobs running as a cron on the
  Hetzner box itself, or as a Vercel Cron Function hitting a protected API
  route (keeps orchestration in the same place as the rest of the app, but
  adds a network hop for the dump)?
- Confirm what Supabase plan/tier you're on — that determines whether
  Supabase's built-in point-in-time recovery is already sufficient for
  auth/orders/cart, or whether that also needs a supplemental export.
