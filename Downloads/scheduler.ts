// workers/src/scheduler.ts
// ─── BULLMQ JOB SCHEDULER ────────────────────────────────────
// Central scheduler for all recurring background jobs.
// BullMQ uses Redis as its backbone — jobs survive restarts,
// failed jobs retry automatically, all jobs are visible in Bull Board.

import { Queue, Worker, QueueEvents, Job } from 'bullmq'
import { createClient } from 'redis'
import IORedis from 'ioredis'

// ─── REDIS CONNECTION ─────────────────────────────────────────

const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,  // required by BullMQ
  enableReadyCheck: false,
})

// ─── JOB QUEUES ───────────────────────────────────────────────

export const Queues = {
  vendorSync:       new Queue('vendor-sync',        { connection: redisConnection }),
  orderProcessor:   new Queue('order-processor',    { connection: redisConnection }),
  trackingSync:     new Queue('tracking-sync',      { connection: redisConnection }),
  abandonedCart:    new Queue('abandoned-cart',     { connection: redisConnection }),
  mapMonitor:       new Queue('map-monitor',        { connection: redisConnection }),
  competitorScrape: new Queue('competitor-scraper', { connection: redisConnection }),
  emailSender:      new Queue('email-sender',       { connection: redisConnection }),
  pointsExpiration: new Queue('points-expiration',  { connection: redisConnection }),
  backInStock:      new Queue('back-in-stock',      { connection: redisConnection }),
}

// ─── SCHEDULE RECURRING JOBS ──────────────────────────────────
// Called once on startup. BullMQ handles deduplication —
// won't create duplicate recurring jobs if already scheduled.

export async function scheduleRecurringJobs() {
  console.log('⏰ Scheduling recurring jobs...')

  // Vendor sync — every 6 hours per vendor
  // Each vendor gets its own job so one failure doesn't block others
  const vendors = ['wps', 'drag_specialties', 'tucker_rocky', 'parts_unlimited']
  for (const vendorId of vendors) {
    await Queues.vendorSync.add(
      `sync-${vendorId}`,
      { vendorId, type: 'full' },
      {
        repeat: { pattern: '0 */6 * * *' },  // every 6 hours
        jobId: `recurring-vendor-sync-${vendorId}`,  // prevents duplicates
      }
    )
  }

  // Inventory-only sync more frequently (stock changes faster than product data)
  for (const vendorId of vendors) {
    await Queues.vendorSync.add(
      `inventory-${vendorId}`,
      { vendorId, type: 'inventory_only' },
      {
        repeat: { pattern: '0 * * * *' },   // every hour
        jobId: `recurring-inventory-${vendorId}`,
      }
    )
  }

  // Abandoned cart checker — every 30 minutes
  await Queues.abandonedCart.add(
    'check-abandoned-carts',
    {},
    {
      repeat: { pattern: '*/30 * * * *' },
      jobId: 'recurring-abandoned-cart',
    }
  )

  // Tracking sync — every 30 minutes
  await Queues.trackingSync.add(
    'sync-tracking',
    {},
    {
      repeat: { pattern: '*/30 * * * *' },
      jobId: 'recurring-tracking-sync',
    }
  )

  // MAP compliance monitor — daily at 2 AM EST
  await Queues.mapMonitor.add(
    'map-compliance-check',
    {},
    {
      repeat: { pattern: '0 7 * * *' },  // 2 AM EST = 7 AM UTC
      jobId: 'recurring-map-monitor',
    }
  )

  // Competitor price scraping — daily at 3 AM EST
  await Queues.competitorScrape.add(
    'scrape-competitors',
    { maxSkus: 500 },
    {
      repeat: { pattern: '0 8 * * *' },  // 3 AM EST = 8 AM UTC
      jobId: 'recurring-competitor-scrape',
    }
  )

  // Points expiration check — monthly, 1st of month at 4 AM
  await Queues.pointsExpiration.add(
    'expire-points',
    {},
    {
      repeat: { pattern: '0 9 1 * *' },  // 4 AM EST = 9 AM UTC, 1st of month
      jobId: 'recurring-points-expiration',
    }
  )

  // Birthday points — daily at midnight
  await Queues.pointsExpiration.add(
    'award-birthday-points',
    { action: 'birthday' },
    {
      repeat: { pattern: '0 5 * * *' },  // midnight EST = 5 AM UTC
      jobId: 'recurring-birthday-points',
    }
  )

  // Back-in-stock alerts — every 2 hours
  await Queues.backInStock.add(
    'check-back-in-stock',
    {},
    {
      repeat: { pattern: '0 */2 * * *' },
      jobId: 'recurring-back-in-stock',
    }
  )

  console.log('✅ All recurring jobs scheduled')
}

// ─── TRIGGER JOBS ON-DEMAND ───────────────────────────────────
// Call these from your Next.js API routes (Stripe webhook, etc.)

/**
 * Trigger order processing immediately after Stripe payment confirmed.
 * Called from: POST /api/webhooks/stripe
 */
export async function triggerOrderProcessing(orderId: string) {
  return Queues.orderProcessor.add(
    'process-order',
    { orderId },
    {
      priority: 1,           // highest priority
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 7 * 24 * 60 * 60 },  // keep 7 days
      removeOnFail: { age: 30 * 24 * 60 * 60 },      // keep 30 days
    }
  )
}

/**
 * Queue an email to send. Called from workers and API routes.
 */
export async function queueEmail(payload: {
  type: string
  to: string
  userId?: string
  orderId?: string
  cartId?: string
  data: Record<string, unknown>
  delay?: number  // ms to wait before sending
}) {
  return Queues.emailSender.add(
    `email-${payload.type}`,
    payload,
    {
      delay: payload.delay ?? 0,
      attempts: 3,
      backoff: { type: 'fixed', delay: 30000 },  // retry after 30s
    }
  )
}

/**
 * Trigger a single vendor sync immediately (from admin dashboard).
 */
export async function triggerVendorSync(vendorId: string, type: 'full' | 'inventory_only' = 'full') {
  return Queues.vendorSync.add(
    `manual-sync-${vendorId}`,
    { vendorId, type, manual: true },
    {
      priority: 5,  // higher priority than scheduled syncs
    }
  )
}

/**
 * Trigger competitor price check for a specific SKU (from admin).
 */
export async function triggerCompetitorCheck(productId: string) {
  return Queues.competitorScrape.add(
    `spot-check-${productId}`,
    { productIds: [productId] },
    { priority: 5 }
  )
}

// ─── QUEUE METRICS (for admin dashboard) ──────────────────────

export async function getQueueMetrics() {
  const metrics: Record<string, unknown> = {}

  for (const [name, queue] of Object.entries(Queues)) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ])

    metrics[name] = { waiting, active, completed, failed, delayed }
  }

  return metrics
}
