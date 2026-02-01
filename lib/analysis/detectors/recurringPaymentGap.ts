import { FactRecord, ProposedIssue } from "../types";
import { calculatePaymentGapImpact, formatImpactRationale } from "../impact";
import { generatePaymentGapSummary } from "../evidenceSummary";

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

  // Group by canonical entity (falls back to entityName for non-bank transactions)
  const byEntity = new Map<string, FactRecord[]>();
  for (const payment of monthlyPayments) {
    const key = payment.entityCanonical || payment.entityName || "_unknown_";
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

    // Calculate months missed from largest gap
    const lastGap = gaps[gaps.length - 1];
    const monthsMissed = Math.floor(lastGap.gapDays / 30) - 1;

    // Get payments before the gap for impact calculation
    const paymentsBeforeGap = sorted.slice(0, lastGap.index + 1);

    // Calculate impact using strict rules
    const impact = calculatePaymentGapImpact(paymentsBeforeGap, monthsMissed);

    // Generate evidence summary
    const { summary: evidenceSummary, stats: evidenceStats } = generatePaymentGapSummary(
      sorted,
      lastGap.gapDays,
      lastGap.afterDate
    );

    // Use the original entityName for display (not the canonical key)
    const displayName = entity === "_unknown_" ? null : (sorted[0].entityName || entity);

    const rationale: string[] = [
      `${sorted.length} monthly payments detected for this entity`,
      `Gap of ${lastGap.gapDays} days after ${lastGap.afterDate} (expected ~30 days)`,
    ];

    if (monthsMissed > 0) {
      rationale.push(`Approximately ${monthsMissed} payment(s) may be missing`);
    }

    const impactRationale = formatImpactRationale(impact);
    if (impactRationale) {
      rationale.push(impactRationale);
    }

    issues.push({
      issueType: "recurring_payment_gap",
      title: `Recurring payment gap for ${displayName || "unknown entity"}`,
      severity: monthsMissed >= 3 ? "high" : monthsMissed >= 2 ? "medium" : "low",
      confidence: Math.min(...sorted.map((p) => p.confidence)),
      impactMin: impact.impactMin,
      impactMax: impact.impactMax,
      currency: impact.currency,
      rationale,
      evidenceFactIds: sorted.map((p) => p.id),
      entityName: displayName,
      evidenceSummary,
      evidenceStats,
    });
  }

  return issues;
}
