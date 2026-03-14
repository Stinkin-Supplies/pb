# Powersports Platform — Stack Setup Guide
## Supabase + Vercel + Hetzner VPS

---

## Your Final Stack (confirmed)

| Layer | Service | Monthly Cost |
|---|---|---|
| Frontend + API routes | Vercel Pro (Next.js) | $20 |
| Database + Auth + Realtime | Supabase Pro | $25 |
| Search | Typesense (self-hosted on VPS) | $0 |
| Job queues + caching | Redis on VPS | $0 |
| Background workers | Docker on VPS | $0 |
| VPS (runs all $0 services) | Hetzner CX21 | $6 |
| Email | Resend | $20 |
| Payments | Stripe | 2.9% + $0.30 |
| **Total fixed** | | **~$71/month** |

---

## Phase 1: Supabase Setup (30 minutes)

### 1. Create project
1. Go to supabase.com → New project
2. Name: `powersports-prod`
3. Region: `us-east-1`
4. Save your database password somewhere safe

### 2. Run migrations
In the Supabase SQL editor, run in order:
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_functions.sql`

Or via CLI:
```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

### 3. Generate TypeScript types
```bash
supabase gen types typescript --project-id your-project-ref > src/lib/supabase/types.ts
```

### 4. Enable Realtime
Dashboard → Database → Replication → enable for: `orders`, `cart_items`

---

## Phase 2: Hetzner VPS (20 minutes)

### 1. Create server
hetzner.com/cloud → Ubuntu 24.04 → CX21 ($6/mo) → Ashburn VA

### 2. Provision
```bash
ssh root@your-server-ip
bash <(curl -fsSL https://your-repo/scripts/setup-vps.sh)
```

### 3. Deploy workers
```bash
ssh deploy@your-server-ip
cd /opt/powersports
git clone your-repo .
cp .env.example .env && nano .env
docker compose up -d
docker compose ps
```

### 4. Access Bull Board (job dashboard)
```bash
ssh -L 3001:localhost:3001 deploy@your-server-ip
# Open: http://localhost:3001
```

---

## Phase 3: Vercel (15 minutes)

```bash
cd your-nextjs-app && vercel
```

Add environment variables in Vercel dashboard:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
TYPESENSE_HOST=your-vps-ip
TYPESENSE_PORT=8108
TYPESENSE_API_KEY=
REDIS_URL=redis://:password@your-vps-ip:6379
RESEND_API_KEY=
```

Stripe webhook URL: `https://yourstore.com/api/webhooks/stripe`
Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`

---

## What Each Worker Does

| Worker | Trigger | What it does |
|---|---|---|
| `vendor-sync` | Every 6hr | Pulls WPS/DS feeds, updates products + prices |
| `inventory-sync` | Every 1hr | Updates stock levels only |
| `order-processor` | Instant (Stripe webhook) | Splits order by vendor, submits POs |
| `tracking-sync` | Every 30min | Polls vendors for tracking, emails customers |
| `abandoned-cart` | Every 30min | Sends 3-email sequence (1hr / 24hr / 72hr) |
| `map-monitor` | Daily 2AM | Finds violations, auto-corrects prices |
| `competitor-scraper` | Daily 3AM | Checks RevZilla + JPC for top 500 SKUs |
| `email-sender` | Continuous | Drains email_queue table via Resend |
| `points-expiration` | Monthly | Expires inactive points, warns users |
| `back-in-stock` | Every 2hr | Notifies waitlisted users |

---

## Upgrade Path (never re-architect, just resize)

| Revenue | Config | Fixed Cost |
|---|---|---|
| Launch | Hetzner CX21 + Supabase Pro | $71/mo |
| $50K/mo revenue | Hetzner CX41 (4 vCPU/8GB) | $110/mo |
| $200K/mo revenue | Hetzner CCX23 (8 vCPU/16GB) + Supabase Pro Large | $200/mo |
| $1M+/mo revenue | Hetzner bare metal + Supabase Enterprise | $450/mo |

---

## Cost vs Firebase

| Volume | Firebase | This Stack | Annual Savings |
|---|---|---|---|
| Launch | $30 | $71 | Firebase cheaper early |
| 1K orders/mo | $200 | $71 | $1,548/yr |
| 5K orders/mo | $600 | $110 | $5,880/yr |
| 10K orders/mo | $1,200 | $160 | $12,480/yr |
| 25K orders/mo | $3,000+ | $250 | $32,400+/yr |

---

## Everything from existing work transfers unchanged

- All TypeScript types
- MAP compliance engine
- Points ledger logic (now atomic via Postgres function)
- Vendor adapters (WPS, Drag Specialties)
- Garage UI component
- Abandoned cart email sequence
- Order processing flow

Only change: Firestore helpers → `db.*` helpers in `supabase/client.ts`
