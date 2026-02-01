import { FactRecord, ProposedIssue } from "../types";
import { calculateDriftImpact, formatImpactRationale } from "../impact";
import { generateAmountDriftSummary } from "../evidenceSummary";

const MIN_OCCURRENCES = 4;
const DRIFT_THRESHOLD = 0.2; // 20%
const STABILITY_THRESHOLD = 0.1; // 10%

function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function detectAmountDrift(facts: FactRecord[]): ProposedIssue[] {
  const issues: ProposedIssue[] = [];

  // Find payments with monthly recurrence and amounts
  const monthlyPayments = facts.filter(
    (f) =>
      f.factType === "payment" &&
      f.recurrence === "monthly" &&
      f.dateValue &&
      f.amountValue !== null
  );

  if (monthlyPayments.length < MIN_OCCURRENCES) {
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
    if (payments.length < MIN_OCCURRENCES) continue;

    // Sort by date
    const sorted = [...payments].sort(
      (a, b) => parseDate(a.dateValue!).getTime() - parseDate(b.dateValue!).getTime()
    );

    // Get amounts
    const amounts = sorted.map((p) => p.amountValue!);

    // Check if prior amounts (excluding last 2) are stable
    if (amounts.length < 4) continue;

    const priorAmounts = amounts.slice(0, -2);
    const recentAmounts = amounts.slice(-2);

    const priorMedian = median(priorAmounts);
    const maxPriorDeviation = Math.max(
      ...priorAmounts.map((a) => Math.abs(a - priorMedian) / priorMedian)
    );

    // Skip if prior amounts are not stable
    if (maxPriorDeviation > STABILITY_THRESHOLD) continue;

    // Check if recent amounts are lower by >= 20%
    const recentAvg = recentAmounts.reduce((a, b) => a + b, 0) / recentAmounts.length;
    const drift = (priorMedian - recentAvg) / priorMedian;

    if (drift < DRIFT_THRESHOLD) continue;

    // Calculate impact using strict rules
    const impact = calculateDriftImpact(sorted, priorMedian, recentAvg);

    // Generate evidence summary
    const driftPercent = drift * 100;
    const { summary: evidenceSummary, stats: evidenceStats } = generateAmountDriftSummary(
      sorted,
      priorMedian,
      recentAvg,
      driftPercent
    );

    // Use the original entityName for display (not the canonical key)
    const displayName = entity === "_unknown_" ? null : (sorted[0].entityName || entity);

    const rationale: string[] = [
      `${sorted.length} monthly payments analyzed`,
      `Prior stable amount: ${priorMedian.toFixed(2)}/month`,
      `Recent average: ${recentAvg.toFixed(2)}/month`,
      `Decrease of ${driftPercent.toFixed(1)}% detected`,
    ];

    const impactRationale = formatImpactRationale(impact);
    if (impactRationale) {
      rationale.push(impactRationale);
    }

    issues.push({
      issueType: "amount_drift",
      title: `Payment amount decreased for ${displayName || "unknown entity"}`,
      severity: drift >= 0.4 ? "high" : drift >= 0.3 ? "medium" : "low",
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
