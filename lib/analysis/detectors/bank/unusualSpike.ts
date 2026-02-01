/**
 * Unusual Spike Detector
 *
 * Detects when a charge from a merchant is unusually high compared to
 * their historical pattern.
 *
 * Rules:
 * - Merchant has >= 6 historical outflows (cleared)
 * - Current charge > 2.5x median of prior charges
 * - Excludes non-merchant transactions (transfers, payments, etc.)
 */

import { FactRecord, ProposedIssue, Severity } from "../../types";
import { isNonMerchantTransaction } from "../../exclusions";

const MIN_HISTORY = 6;
const SPIKE_MULTIPLIER = 2.5;
const HIGH_SPIKE_THRESHOLD = 200; // $200 above median = high severity

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

export function detectUnusualSpike(facts: FactRecord[]): ProposedIssue[] {
  const issues: ProposedIssue[] = [];

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
    // Need MIN_HISTORY + 1 total (MIN_HISTORY in history + 1 current to check for spike)
    if (entityFacts.length < MIN_HISTORY + 1) {
      continue;
    }

    // Sort by date
    const sorted = [...entityFacts].sort(
      (a, b) => new Date(a.dateValue!).getTime() - new Date(b.dateValue!).getTime()
    );

    // Get historical amounts (all but the most recent)
    const history = sorted.slice(0, -1);
    const recentCharge = sorted[sorted.length - 1];

    const historyAmounts = history.map((f) => Math.abs(f.amountValue!));
    const historyMedian = median(historyAmounts);
    const recentAmount = Math.abs(recentCharge.amountValue!);

    if (historyMedian === 0) {
      continue;
    }

    // Check if recent charge is a spike
    const multiplier = recentAmount / historyMedian;
    if (multiplier < SPIKE_MULTIPLIER) {
      continue;
    }

    // Calculate impact
    const spikeAmount = recentAmount - historyMedian;
    const currency = recentCharge.amountCurrency;

    // Determine severity
    let severity: Severity = "medium";
    if (spikeAmount >= HIGH_SPIKE_THRESHOLD) {
      severity = "high";
    }

    const displayName = sorted[0].entityName || entityKey;

    // Get recent context (last few charges for evidence)
    const recentContext = sorted.slice(-4);

    const rationale: string[] = [
      `Recent charge (${currency || ""} ${recentAmount.toFixed(2)}) is ${multiplier.toFixed(1)}x the historical median`,
      `Historical median: ${currency || ""} ${historyMedian.toFixed(2)} (${history.length} prior charges)`,
      `Date of spike: ${recentCharge.dateValue}`,
    ];

    if (currency) {
      rationale.push(`Amount above typical: ${currency} ${spikeAmount.toFixed(2)}`);
    }

    // Confidence based on history depth
    const confidence = Math.min(0.5 + (history.length / 20) * 0.3, 0.85);

    issues.push({
      issueType: "unusual_spike",
      title: `Unusual charge amount: ${displayName}`,
      severity,
      confidence,
      impactMin: spikeAmount,
      impactMax: spikeAmount,
      currency,
      rationale,
      evidenceFactIds: recentContext.map((f) => f.id),
      entityName: displayName,
      evidenceSummary: `${currency || ""} ${recentAmount.toFixed(2)} vs typical ${currency || ""} ${historyMedian.toFixed(2)} (${multiplier.toFixed(1)}x)`,
      evidenceStats: {
        count: entityFacts.length,
        dateRange: {
          start: sorted[0].dateValue!,
          end: recentCharge.dateValue!,
        },
        medianAmount: historyMedian,
        currency,
        sourceReferences: recentContext.map((f) => f.sourceReference),
      },
    });
  }

  return issues;
}
