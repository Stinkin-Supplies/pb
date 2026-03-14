# 🏍️ Powersports Platform — Setup Guide & Architecture Reference

## Quick Start

```bash
# 1. Create Next.js project
npx create-next-app@latest powersports-platform --typescript --tailwind --eslint --app --src-dir

# 2. Install all dependencies
npm install firebase firebase-admin stripe @stripe/stripe-js @stripe/react-stripe-js \
  algoliasearch react-instantsearch resend @react-email/components @react-email/render \
  date-fns clsx tailwind-merge zod zustand @headlessui/react @heroicons/react \
  recharts react-hot-toast

npm install -D @tailwindcss/forms @tailwindcss/typography @tailwindcss/aspect-ratio

# 3. Firebase project setup
npm install -g firebase-tools
firebase login
firebase init   # Select: Firestore, Functions, Storage, Emulators, Hosting

# 4. Copy .env.example → .env.local and fill in values
cp .env.example .env.local

# 5. Start development with emulators
npm run emulators   # In terminal 1
npm run dev         # In terminal 2
```

---

## Firebase Project Setup

### 1. Create Firebase Project
1. Go to console.firebase.google.com
2. Create new project: "powersports-prod"
3. Enable Google Analytics (yes, for funnel tracking)
4. Create a second project: "powersports-dev" (always separate dev/prod)

### 2. Enable Services
In each project, enable:
- **Authentication** → Email/Password + Google sign-in
- **Firestore** → Start in production mode
- **Storage** → For product images
- **Functions** → Node.js 20
- **Analytics** → Already enabled

### 3. Set Custom Claims for Admin Roles
Run this once after creating your first admin user:
```javascript
// In Firebase Admin SDK (run as a script)
import { getAuth } from 'firebase-admin/auth'

await getAuth().setCustomUserClaims('YOUR_ADMIN_UID', {
  role: 'admin'
})
```

### 4. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 5. Create Firestore Indexes
Create these composite indexes in Firebase Console → Firestore → Indexes:

| Collection | Fields | Order |
|---|---|---|
| orders | uid ASC, createdAt DESC | — |
| orders | status ASC, createdAt DESC | — |
| carts | status ASC, lastActivityAt ASC | — |
| carts | abandonmentEmailsSent ASC, lastActivityAt ASC | — |
| pointsLedger (subcollection) | createdAt DESC | — |
| products | status ASC, brand ASC | — |
| products | category ASC, status ASC | — |
| competitorPricing | recommendation ASC, lowestCompetitorPrice ASC | — |
| mapAlerts | isViolation ASC, createdAt DESC | — |

---

## App Router Folder Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout (fonts, providers)
│   ├── page.tsx                      # Homepage
│   ├── (store)/                      # Customer-facing routes
│   │   ├── layout.tsx                # Store layout (nav, footer)
│   │   ├── catalog/
│   │   │   └── [[...category]]/
│   │   │       └── page.tsx          # Category browsing + search
│   │   ├── product/
│   │   │   └── [slug]/
│   │   │       └── page.tsx          # Product detail page
│   │   ├── cart/
│   │   │   └── page.tsx
│   │   ├── checkout/
│   │   │   ├── page.tsx              # Checkout form
│   │   │   └── success/page.tsx      # Order confirmation
│   │   └── account/
│   │       ├── layout.tsx            # Account sidebar layout
│   │       ├── page.tsx              # Account overview
│   │       ├── orders/
│   │       │   ├── page.tsx          # Order history
│   │       │   └── [orderId]/page.tsx
│   │       ├── points/page.tsx       # Points balance & history
│   │       ├── garage/page.tsx       # My bikes
│   │       └── profile/page.tsx      # Edit profile
│   ├── (auth)/                       # Auth routes
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── forgot-password/page.tsx
│   └── (admin)/                      # Admin routes (role-protected)
│       ├── layout.tsx                # Admin layout (sidebar nav)
│       ├── dashboard/page.tsx        # Overview metrics
│       ├── orders/
│       │   ├── page.tsx              # Orders table
│       │   └── [orderId]/page.tsx    # Order detail + actions
│       ├── products/
│       │   ├── page.tsx              # Catalog management
│       │   └── [sku]/page.tsx        # Edit product
│       ├── customers/
│       │   ├── page.tsx
│       │   └── [uid]/page.tsx
│       ├── vendors/
│       │   ├── page.tsx
│       │   └── [vendorId]/page.tsx
│       ├── compliance/               # MAP compliance
│       │   ├── page.tsx              # Compliance dashboard
│       │   └── competitors/page.tsx  # Price intelligence
│       ├── marketing/
│       │   ├── page.tsx              # Campaign overview
│       │   ├── abandoned-carts/page.tsx
│       │   └── points/page.tsx       # Points program config
│       └── reports/page.tsx
│
├── components/
│   ├── ui/                           # Generic reusable components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Badge.tsx
│   │   ├── Skeleton.tsx
│   │   ├── Table.tsx
│   │   └── Toast.tsx
│   ├── store/                        # Customer-facing components
│   │   ├── Navbar.tsx
│   │   ├── Footer.tsx
│   │   ├── ProductCard.tsx
│   │   ├── ProductGrid.tsx
│   │   ├── FitmentSelector.tsx       # Year/Make/Model picker
│   │   ├── GarageSelector.tsx        # Quick filter by saved bike
│   │   ├── CartDrawer.tsx
│   │   ├── PointsWidget.tsx          # Points balance display
│   │   ├── PointsRedemption.tsx      # Checkout points slider
│   │   ├── FitmentBadge.tsx          # "Fits your Road King" badge
│   │   └── ReviewForm.tsx
│   ├── admin/                        # Admin-only components
│   │   ├── AdminNav.tsx
│   │   ├── MetricCard.tsx
│   │   ├── OrderTable.tsx
│   │   ├── MAPComplianceTable.tsx
│   │   ├── CompetitorPriceTable.tsx
│   │   ├── VendorStatusCard.tsx
│   │   └── ChartWrapper.tsx
│   └── shared/                       # Used in both store and admin
│       ├── OrderStatusBadge.tsx
│       ├── PriceDisplay.tsx
│       └── LoadingSpinner.tsx
│
├── lib/
│   ├── firebase/
│   │   ├── config.ts                 ✅ Created
│   │   └── firestore.ts              ✅ Created
│   ├── map/
│   │   └── engine.ts                 ✅ Created
│   ├── points/
│   │   └── ledger.ts                 ✅ Created
│   ├── vendors/
│   │   └── adapters.ts               ✅ Created
│   ├── fitment/
│   │   └── query.ts                  # Fitment lookup helpers
│   ├── search/
│   │   └── algolia.ts                # Algolia client + indexing helpers
│   ├── email/
│   │   ├── resend.ts                 # Resend client
│   │   └── templates/                # React Email templates
│   │       ├── OrderConfirmation.tsx
│   │       ├── OrderShipped.tsx
│   │       ├── AbandonedCart1.tsx
│   │       ├── AbandonedCart2.tsx
│   │       ├── AbandonedCart3.tsx
│   │       └── PointsEarned.tsx
│   ├── stripe/
│   │   └── client.ts                 # Stripe helpers
│   └── utils/
│       ├── formatters.ts             # Price, date, number formatting
│       └── validators.ts             # Zod schemas
│
├── hooks/
│   ├── useAuth.ts                    # Auth state + user data
│   ├── useCart.ts                    # Cart state (Zustand + Firestore)
│   ├── usePoints.ts                  # Points balance + transactions
│   ├── useGarage.ts                  # User's vehicles
│   ├── useFitment.ts                 # Active fitment filter
│   └── useAdmin.ts                   # Admin role check
│
└── types/
    └── index.ts                      ✅ Created

functions/
├── src/
│   ├── index.ts                      # Export all functions
│   ├── orderProcessor.ts             ✅ Created
│   ├── abandonedCart.ts              ✅ Created
│   ├── vendorSync.ts                 # Product feed ingestion
│   ├── mapMonitor.ts                 # MAP compliance checker
│   ├── competitorScraper.ts          # RevZilla/JP Cycles price check
│   ├── pointsExpiration.ts           # Monthly expiration check
│   ├── emailSender.ts                # Process email queue
│   └── webhooks/
│       └── stripe.ts                 # Stripe webhook handler
```

---

## Stripe Webhook Setup

Your checkout flow:
1. Customer hits "Place Order" → API Route creates Stripe Payment Intent
2. Stripe.js confirms payment client-side
3. Stripe sends `payment_intent.succeeded` webhook to your server
4. Webhook handler creates the Order document in Firestore
5. `onOrderCreated` Cloud Function fires and submits to vendors

```bash
# Install Stripe CLI for local webhook testing
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Webhook endpoint: `POST /api/webhooks/stripe`
Events to handle:
- `payment_intent.succeeded` → Create order
- `payment_intent.payment_failed` → Notify customer
- `charge.refunded` → Update order status + reverse points

---

## Vendor Integration Checklist

### WPS (Western Power Sports)
- [ ] Contact WPS rep and request API credentials
- [ ] Request API documentation (or download from partner portal)
- [ ] Confirm MAP feed delivery method (API or FTP)
- [ ] Test authentication with sandbox/staging environment
- [ ] Verify ACES fitment data is included in product feed

### Drag Specialties / Parts Unlimited
- [ ] Contact DS rep and request B2B data feed access
- [ ] Ask specifically about: FTP feed format, ACES data, real-time inventory API
- [ ] Request sample files to understand their CSV/XML format
- [ ] Confirm order submission method (EDI, API, or portal)
- [ ] Get MAP sheet delivery schedule

### For each additional vendor:
- [ ] Create VendorAdapter class in `src/lib/vendors/adapters.ts`
- [ ] Create vendor document in Firestore `/vendors/{vendorId}`
- [ ] Store credentials in Firebase Secret Manager
- [ ] Test feed ingestion in dev environment
- [ ] Test order submission with a test order

---

## MAP Compliance Notes

⚠️ **Critical rules for DS specifically:**
- MAP applies to ALL public-facing prices (logged in or not)
- Free shipping cannot effectively reduce MAP price (check your DS agreement)
- Points redemption cannot reduce price below MAP
- Coupon codes on MAP items: check per-vendor — most prohibit this

**When a vendor changes MAP:**
1. Scheduled function detects change in next feed sync
2. Alert created in `/mapAlerts` collection
3. If `autoCorrect=true` (admin setting), price auto-raises to new MAP
4. Admin receives email digest of all MAP changes
5. Change logged in audit trail

---

## Admin Roles & Permissions

| Feature | admin | sales_rep | viewer |
|---|---|---|---|
| View all data | ✅ | ✅ | ✅ |
| Modify orders | ✅ | ✅ | ❌ |
| Manage products | ✅ | ❌ | ❌ |
| Adjust prices | ✅ | ❌ | ❌ |
| Adjust points | ✅ | ✅ | ❌ |
| Manage vendors | ✅ | ❌ | ❌ |
| Run reports | ✅ | ✅ | ✅ |
| Manage users | ✅ | ✅ | ❌ |
| View financials | ✅ | ❌ | ❌ |
| Config settings | ✅ | ❌ | ❌ |

---

## Cost Optimization Tips

1. **Firestore reads**: Use `onSnapshot` only in admin dashboard — paginate product lists
2. **Functions**: Set minimum instances to 0 except for Stripe webhook handler (set min=1 to avoid cold starts on payment)
3. **Algolia**: Index only active products — filter inactive in your sync function
4. **Competitor scraping**: Start with top 200 SKUs by sales, not your whole catalog
5. **Email**: Use Resend's batch API — send multiple emails in one API call
6. **Images**: Store originals in Firebase Storage, use Next.js Image component for automatic CDN + optimization

---

## Phase Build Checklist

### Phase 1 — Foundation
- [ ] Firebase project created and configured
- [ ] Next.js app scaffolded with Tailwind
- [ ] Auth working (register, login, Google)
- [ ] Firestore rules deployed
- [ ] Admin role claim set on your account
- [ ] Basic product schema and one test product in Firestore
- [ ] `.env.local` configured

### Phase 2 — First Vendor (WPS recommended first)
- [ ] WPS API credentials obtained
- [ ] WPS adapter implemented and tested
- [ ] Product feed ingestion Cloud Function deployed
- [ ] 100+ products synced from WPS
- [ ] Algolia index set up and products indexed
- [ ] MAP prices loading correctly

### Phase 3 — Storefront
- [ ] Product listing page with search
- [ ] Fitment selector (Year/Make/Model)
- [ ] Product detail page
- [ ] Cart functionality
- [ ] Stripe checkout working
- [ ] Order confirmation page

### Phase 4 — Fulfillment
- [ ] Stripe webhook handler deployed
- [ ] Order creation on payment success
- [ ] WPS order submission via API
- [ ] Tracking sync function deployed
- [ ] Order confirmation email sending
- [ ] Shipping notification email sending

### Phase 5 — Loyalty & Marketing
- [ ] Points awarded on purchase
- [ ] Points redemption at checkout
- [ ] Garage feature built
- [ ] Garage points bonus
- [ ] Abandoned cart detection deployed
- [ ] Abandoned cart email sequence live

### Phase 6 — Admin Dashboard
- [ ] Admin route group with role protection
- [ ] Dashboard overview metrics
- [ ] Order management table + detail view
- [ ] MAP compliance dashboard
- [ ] Competitor price intelligence table
- [ ] Customer management with points adjustment
- [ ] Vendor management + sync controls
