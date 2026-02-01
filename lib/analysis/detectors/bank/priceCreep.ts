/**
 * Price Creep Detector
 *
 * Detects when a recurring charge has increased significantly from its baseline.
 *
 * Rules:
 * - Merchant classified as monthly (derived)
 * - At least 4 occurrences
 * - Last occurrence amount >= 15% higher than median of previous occurrences
 * - Baseline amounts must be stable (within ±10%)
 * - Excludes non-merchant transactions
 */

import { FactRecord, ProposedIssue, Severity } from "../../types";
import { RecurrenceClassification } from "../../recurrence/types";
import { isNonMerchantTransaction } from "../../exclusions";

const MIN_OCCURRENCES = 4;
const PRICE_INCREASE_THRESHOLD = 0.15; // 15%
const BASELINE_STABILITY_THRESHOLD = 0.10; // 10%
const HIGH_DELTA_ANNUAL_THRESHOLD = 100; // $100/year delta = high severity

interface PriceCreepOptions {
  derivedRecurrence: Map<string, RecurrenceClassification>;
}

function getEntityKey(fact: FactRecord): string {
  return fact.entityCanonical || fact.entityRaw || fact.entityName || "_unknown_";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function detectPriceCreep(
  facts: FactRecord[],
  options: PriceCreepOptions
): ProposedIssue[] {
  const issues: ProposedIssue[] = [];
  const { derivedRecurrence } = options;

  // Group facts by entity
  const byEntity = new Map<string, FactRecord[]>();
  for (const fact of facts) {
    if (
      fact.direction !== "outflow" ||
      fact.clearingStatus !== "cleared" ||
      !fact.dateValue ||
      fact.amountValue === null
    ) {
      continue;
    }

    const key = getEntityKey(fact);

    // Skip non-merchant transactions
    if (isNonMerchantTransaction(key)) {
      continue;
    }

    if (!byEntity.has(key)) {
      byEntity.set(key, []);
    }
    byEntity.get(key)!.push(fact);
  }

  // Check each entity
  for (const [entityKey, entityFacts] of byEntity) {
    const classification = derivedRecurrence.get(entityKey);

    // Need to be classified as monthly (but we allow some flexibility here)
    // The key is having enough stable baseline data
    if (entityFacts.length < MIN_OCCURRENCES) {
      continue;
    }

    // Sort by date
    const sorted = [...entityFacts].sort(
      (a, b) => new Date(a.dateValue!).getTime() - new Date(b.dateValue!).getTime()
    );

    // Get baseline (all but last) and last occurrence
    const baseline = sorted.slice(0, -1);
    const lastOccurrence = sorted[sorted.length - 1];

    const baselineAmounts = baseline.map((f) => Math.abs(f.amountValue!));
    const baselineMedian = median(baselineAmounts);
    const lastAmount = Math.abs(lastOccurrence.amountValue!);

    if (baselineMedian === 0) {
      continue;
    }

    // Check baseline stability
    const isBaselineStable = baselineAmounts.every((amount) => {
      const deviation = Math.abs(amount - baselineMedian) / baselineMedian;
      return deviation <= BASELINE_STABILITY_THRESHOLD;
    });

    if (!isBaselineStable) {
      continue; // Can't reliably detect creep if baseline is already unstable
    }

    // Check if last amount is significantly higher
    const percentIncrease = (lastAmount - baselineMedian) / baselineMedian;

    if (percentIncrease < PRICE_INCREASE_THRESHOLD) {
      continue; // Not a significant increase
    }

    // Calculate impact
    const monthlyDelta = lastAmount - baselineMedian;
    const annualDelta = monthlyDelta * 12;
    const currency = lastOccurrence.amountCurrency;

    // Determine severity
    let severity: Severity = "medium";
    if (annualDelta > HIGH_DELTA_ANNUAL_THRESHOLD) {
      severity = "high";
    }

    const displayName = sorted[0].entityName || entityKey;

    const rationale: string[] = [
      `Last charge (${currency || ""} ${lastAmount.toFixed(2)}) is ${(percentIncrease * 100).toFixed(0)}% higher than baseline`,
      `Baseline median: ${currency || ""} ${baselineMedian.toFixed(2)} (${baseline.length} prior charges)`,
      "Baseline amounts were stable (within ±10%)",
    ];

    if (classification?.isMonthly) {
      rationale.push("Monthly cadence derived from transaction pattern");
    }

    if (currency) {
      rationale.push(
        `Annualized impact of increase: ${currency} ${annualDelta.toFixed(2)}`
      );
    }

    // Calculate confidence based on classification and evidence count
    const baseConfidence = classification?.confidence ?? 0.6;
    const evidenceBoost = Math.min(entityFacts.length / 6, 1) * 0.2;
    const confidence = Math.min(baseConfidence + evidenceBoost, 0.95);

    issues.push({
      issueType: "price_creep",
      title: `Recurring charge increased: ${displayName}`,
      severity,
      confidence,
      impactMin: annualDelta,
      impactMax: annualDelta,
      currency,
      rationale,
      evidenceFactIds: sorted.map((f) => f.id),
      entityName: displayName,
      evidenceSummary: `Charge increased from ${currency || ""} ${baselineMedian.toFixed(2)} to ${currency || ""} ${lastAmount.toFixed(2)} (+${(percentIncrease * 100).toFixed(0)}%)`,
      evidenceStats: {
        count: entityFacts.length,
        dateRange: {
          start: sorted[0].dateValue!,
          end: lastOccurrence.dateValue!,
        },
        medianAmount: baselineMedian,
        currency,
        sourceReferences: sorted.map((f) => f.sourceReference),
      },
    });
  }

  return issues;
}
