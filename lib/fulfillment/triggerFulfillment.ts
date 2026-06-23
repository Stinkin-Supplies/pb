/**
 * lib/fulfillment/triggerFulfillment.ts
 *
 * Given a confirmed order and one RoutedGroup (from optimizer.resolveFulfillment),
 * writes the vendor_orders row and attempts vendor submission — or routes straight
 * to the manual queue for VTwin.
 *
 * CONFIRMED against real schema (pasted June 18):
 *   vendor_orders: order_id, vendor, vendor_order_number, is_manual, status,
 *   submitted_at, acknowledged_at, api_payload (jsonb), api_response (jsonb),
 *   error_message, retry_count.
 *
 * PU/WPS adapters are intentionally non-functional stubs — no API credentials exist
 * yet (CHASE_LIST item 16: PU_API_URL/KEY, WPS_API_URL/KEY). Calling this today for
 * a PU or WPS group will write a vendor_orders row with status='manual_required' and
 * a clear error_message rather than silently pretending to submit. Swap in real
 * fetch() calls once creds land — the row-write/update plumbing around them won't
 * need to change.
 */

import { getCatalogDb } from '@/lib/db/catalog'; // CONFIRM this import path
import type { RoutedGroup } from './optimizer';

type AdapterResult = {
  success: boolean;
  vendorOrderNumber?: string;
  apiResponse?: unknown;
  errorMessage?: string;
};

async function submitToPU(group: RoutedGroup): Promise<AdapterResult> {
  if (!process.env.PU_API_URL || !process.env.PU_API_KEY) {
    return {
      success: false,
      errorMessage: 'PU_API_URL/PU_API_KEY not configured — needs manual submission',
    };
  }
  // TODO: real PU order-submission call once creds exist.
  return { success: false, errorMessage: 'PU adapter not yet implemented' };
}

async function submitToWPS(group: RoutedGroup): Promise<AdapterResult> {
  if (!process.env.WPS_API_URL || !process.env.WPS_API_KEY) {
    return {
      success: false,
      errorMessage: 'WPS_API_URL/WPS_API_KEY not configured — needs manual submission',
    };
  }
  // TODO: real WPS order-submission call once creds exist.
  return { success: false, errorMessage: 'WPS adapter not yet implemented' };
}

/**
 * Inserts the vendor_orders row for one routed group and attempts vendor submission.
 * VTwin (group.isManual === true) never calls an adapter — it's written straight to
 * the manual queue, which is correct behavior, not a missing-creds fallback.
 */
export async function triggerFulfillment(orderId: number, group: RoutedGroup): Promise<void> {
  const db = getCatalogDb();

  const apiPayload = {
    items: group.items.map((i) => ({
      catalogUnifiedId: i.catalogUnifiedId,
      vendorSku: i.vendorSku,
      qty: i.qty,
    })),
  };

  const insertResult = await db.query(
    `INSERT INTO vendor_orders (order_id, vendor, is_manual, status, api_payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      orderId,
      group.sourceVendor,
      group.isManual,
      group.isManual ? 'pending' : 'submitting',
      JSON.stringify(apiPayload),
    ]
  );
  const vendorOrderId = insertResult.rows[0].id;

  if (group.isManual) {
    // VTwin (or any future manual-only vendor) — nothing more to do here. Surfaces
    // in /admin/fulfillment/vtwin (not yet built per ROADMAP Phase 13) as a pending row.
    return;
  }

  let result: AdapterResult;
  if (group.sourceVendor === 'PU') {
    result = await submitToPU(group);
  } else if (group.sourceVendor === 'WPS') {
    result = await submitToWPS(group);
  } else {
    result = {
      success: false,
      errorMessage: `No adapter defined for vendor "${group.sourceVendor}"`,
    };
  }

  if (result.success) {
    await db.query(
      `UPDATE vendor_orders
       SET status = 'submitted', vendor_order_number = $1, api_response = $2,
           submitted_at = now(), updated_at = now()
       WHERE id = $3`,
      [result.vendorOrderNumber, JSON.stringify(result.apiResponse ?? null), vendorOrderId]
    );
  } else {
    // Not a crash — surfaces as a row needing a human, same as the manual queue,
    // just tagged with why it landed there instead of going out automatically.
    await db.query(
      `UPDATE vendor_orders
       SET status = 'manual_required', error_message = $1, updated_at = now()
       WHERE id = $2`,
      [result.errorMessage ?? 'unknown adapter failure', vendorOrderId]
    );
  }
}
