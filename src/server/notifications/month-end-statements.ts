import "server-only";

import { queryAll } from "@/db/query";
import { getAgencyTimeZone } from "@/server/context/agency-time-zone";
import { queueSystemNotification } from "@/server/notifications/notification-service";
import { zonedDayKey } from "@/lib/timezone";

/** The calendar month that just closed in the agency zone: { month: "2026-10", from: "2026-10-01", to: "2026-10-31" }. */
export function previousMonthPeriod(now: Date, timeZone: string) {
  const [year, month] = zonedDayKey(now, timeZone).split("-").map(Number);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const key = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  return { month: key, from: `${key}-01`, to: `${key}-${String(lastDay).padStart(2, "0")}` };
}

/** Customers whose rentals still have an unpaid balance (expenses billed to them are included in the PDF). */
function customersWithBalance(agencyId: string) {
  return queryAll<{ id: string; due: number }>(`
    SELECT c.id, sum(max(0, bk.total_amount - coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal','payment_adjustment_decrease') THEN -ft.amount ELSE ft.amount END)
      FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
        AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','payment_adjustment_increase','payment_adjustment_decrease','reversal','refund')), 0))) AS due
    FROM customers c
    JOIN bookings bk ON bk.agency_id=c.agency_id AND bk.customer_id=c.id AND bk.archived_at IS NULL AND bk.status NOT IN ('draft','cancelled','no_show')
    WHERE c.agency_id=? AND c.archived_at IS NULL AND c.phone_normalized IS NOT NULL AND c.phone_normalized<>''
    GROUP BY c.id
  `, [agencyId]).then(rows => rows.filter(row => Number(row.due) > 0));
}

/**
 * Monthly job (1st of the month): for agencies that switched on month-end statements, queue the closed
 * month's statement to every customer with an outstanding balance. Idempotency keys make reruns safe.
 */
export async function queueMonthEndStatements(now = new Date(), onlyAgencyId?: string) {
  const agencies = onlyAgencyId ? [{ agencyId: onlyAgencyId }] : await queryAll<{ agencyId: string }>("SELECT agency_id AS agencyId FROM whatsapp_settings WHERE month_end_statements=1");
  let queued = 0;
  for (const { agencyId } of agencies) {
    const period = previousMonthPeriod(now, await getAgencyTimeZone(agencyId));
    for (const customer of await customersWithBalance(agencyId)) {
      await queueSystemNotification(agencyId, {
        kind: "customer.statement",
        entityId: customer.id,
        payload: { from: period.from, to: period.to, reason: "month_end" },
        idempotencyKey: `customer.statement:month_end:${period.month}:${customer.id}`,
      });
      queued += 1;
    }
  }
  return queued;
}
