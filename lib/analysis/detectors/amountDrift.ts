import { FactRecord, ProposedIssue } from "../types";
import { calculateDriftImpact, formatImpactRationale } from "../impact";
import { generateAmountDriftSummary } from "../evidenceSummary";
import { RecurrenceClassification } from "../recurrence/types";

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

function getEntityKey(fact: FactRecord): string {
  return fact.entityCanonical || fact.entityName || "_unknown_";
}

/**
 * Check if a fact should be treated as monthly recurring.
 * Uses stored recurrence first, then falls back to derived classification.
 */
function isMonthlyRecurring(
  fact: FactRecord,
  derivedRecurrence?: Map<string, RecurrenceClassification>
): boolean {
  // If stored recurrence is monthly, use that
  if (fact.recurrence === "monthly") {
    return true;
  }

  // If we have derived classification and stored is unknown, check derived
  if (derivedRecurrence && fact.recurrence === "one_time") {
    const entityKey = getEntityKey(fact);
    const classification = derivedRecurrence.get(entityKey);
    return classification?.isMonthly ?? false;
  }

  return false;
}

export interface AmountDriftOptions {
  derivedRecurrence?: Map<string, RecurrenceClassification>;
}

export function detectAmountDrift(
  facts: FactRecord[],
  options?: AmountDriftOptions
): ProposedIssue[] {
  const issues: ProposedIssue[] = [];
  const derivedRecurrence = options?.derivedRecurrence;

  // Find payments with monthly recurrence (stored or derived) and amounts
  const monthlyPayments = facts.filter(
    (f) =>
      f.factType === "payment" &&
      isMonthlyRecurring(f, derivedRecurrence) &&
      f.dateValue &&
      f.amountValue !== null
  );

  if (monthlyPayments.length < MIN_OCCURRENCES) {
    return [];
  }

  // Group by canonical entity (falls back to entityName for non-bank transactions)
  const byEntity = new Map<string, FactRecord[]>();
  for (const payment of monthlyPayments) {
    const key = getEntityKey(payment);
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

    // Check if this entity uses derived monthly classification
    const usedDerivedRecurrence = derivedRecurrence?.get(entity)?.isMonthly &&
      sorted.some((p) => p.recurrence !== "monthly");

    const rationale: string[] = [
      `${sorted.length} monthly payments analyzed`,
      `Prior stable amount: ${priorMedian.toFixed(2)}/month`,
      `Recent average: ${recentAvg.toFixed(2)}/month`,
      `Decrease of ${driftPercent.toFixed(1)}% detected`,
    ];

    if (usedDerivedRecurrence) {
      rationale.push("Monthly cadence derived from transaction pattern");
    }

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
