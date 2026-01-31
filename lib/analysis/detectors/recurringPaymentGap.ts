import { FactRecord, ProposedIssue } from "../types";

const GAP_THRESHOLD_DAYS = 45;
const MIN_PAYMENTS_FOR_PATTERN = 3;

function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

function daysBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function detectRecurringPaymentGap(facts: FactRecord[]): ProposedIssue[] {
  const issues: ProposedIssue[] = [];

  // Find payments with explicit monthly recurrence
  const monthlyPayments = facts.filter(
    (f) =>
      f.factType === "payment" &&
      f.recurrence === "monthly" &&
      f.dateValue &&
      f.status === "paid"
  );

  if (monthlyPayments.length < MIN_PAYMENTS_FOR_PATTERN) {
    return [];
  }

  // Group by entity
  const byEntity = new Map<string, FactRecord[]>();
  for (const payment of monthlyPayments) {
    const key = payment.entityName || "_unknown_";
    if (!byEntity.has(key)) {
      byEntity.set(key, []);
    }
    byEntity.get(key)!.push(payment);
  }

  for (const [entity, payments] of byEntity) {
    if (payments.length < MIN_PAYMENTS_FOR_PATTERN) continue;

    // Sort by date
    const sorted = [...payments].sort(
      (a, b) => parseDate(a.dateValue!).getTime() - parseDate(b.dateValue!).getTime()
    );

    // Check for gaps
    const gaps: { afterDate: string; gapDays: number; index: number }[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prevDate = parseDate(sorted[i - 1].dateValue!);
      const currDate = parseDate(sorted[i].dateValue!);
      const days = daysBetween(prevDate, currDate);

      if (days > GAP_THRESHOLD_DAYS) {
        gaps.push({
          afterDate: sorted[i - 1].dateValue!,
          gapDays: days,
          index: i - 1,
        });
      }
    }

    if (gaps.length === 0) continue;

    // Calculate impact: months missed * last known amount
    const lastGap = gaps[gaps.length - 1];
    const lastPayment = sorted[lastGap.index];
    const monthsMissed = Math.floor(lastGap.gapDays / 30) - 1;

    let impactMin: number | null = null;
    let impactMax: number | null = null;
    let currency: string | null = null;

    // Only calculate impact if amounts are stable (within 10%)
    const amounts = sorted
      .slice(0, lastGap.index + 1)
      .filter((p) => p.amountValue !== null)
      .map((p) => p.amountValue!);

    if (amounts.length >= 2 && monthsMissed > 0) {
      const median = amounts.sort((a, b) => a - b)[Math.floor(amounts.length / 2)];
      const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - median) / median));

      if (maxDeviation <= 0.1) {
        impactMin = median * monthsMissed;
        impactMax = median * monthsMissed;
        currency = lastPayment.amountCurrency;
      }
    }

    const rationale: string[] = [
      `${sorted.length} monthly payments detected for this entity`,
      `Gap of ${lastGap.gapDays} days after ${lastGap.afterDate} (expected ~30 days)`,
    ];

    if (monthsMissed > 0) {
      rationale.push(`Approximately ${monthsMissed} payment(s) may be missing`);
    }

    if (impactMin !== null) {
      rationale.push(`Estimated missed revenue: ${currency || "USD"} ${impactMin.toFixed(2)}`);
    }

    issues.push({
      issueType: "recurring_payment_gap",
      title: `Recurring payment gap for ${entity === "_unknown_" ? "unknown entity" : entity}`,
      severity: monthsMissed >= 3 ? "high" : monthsMissed >= 2 ? "medium" : "low",
      confidence: Math.min(...sorted.map((p) => p.confidence)),
      impactMin,
      impactMax,
      currency,
      rationale,
      evidenceFactIds: sorted.map((p) => p.id),
      entityName: entity === "_unknown_" ? null : entity,
    });
  }

  return issues;
}
