/**
 * Tiered Monthly Recurrence Classifier
 *
 * Derives monthly recurrence classification for bank transactions using
 * two-tier deterministic rules. Prefers false negatives over false positives.
 *
 * Tier 1 (strict): High confidence, used for price creep and gap detection
 * - Requires >= 3 occurrences
 * - Requires >= 2 intervals within 28-33 days
 * - Requires amounts within ±10% of median
 * - Confidence >= 0.85
 *
 * Tier 2 (likely): Lower confidence, used for new recurring detection
 * - Requires >= 4 occurrences (more evidence needed)
 * - Requires >= 2 intervals within 28-35 days
 * - Requires amounts within ±20% of median
 * - Confidence <= 0.75
 */

import { FactRecord } from "../types";
import {
  RecurrenceClassification,
  RecurrenceTier,
  MONTHLY_INTERVAL_MIN,
  MONTHLY_INTERVAL_MAX,
  MONTHLY_INTERVAL_MIN_LOOSE,
  MONTHLY_INTERVAL_MAX_LOOSE,
  AMOUNT_TOLERANCE,
  AMOUNT_TOLERANCE_LOOSE,
  MIN_OCCURRENCES,
  MIN_OCCURRENCES_TIER2,
  MIN_VALID_INTERVALS,
} from "./types";

/**
 * Get the entity key for grouping (canonical > raw > name)
 */
function getEntityKey(fact: FactRecord): string {
  return fact.entityCanonical || fact.entityRaw || fact.entityName || "_unknown_";
}

/**
 * Calculate days between two date strings
 */
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate median of an array of numbers
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate standard deviation
 */
function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Check if a fact qualifies for recurrence analysis
 */
function isQualifyingFact(fact: FactRecord): boolean {
  return (
    fact.direction === "outflow" &&
    fact.clearingStatus === "cleared" &&
    fact.amountValue !== null &&
    fact.dateValue !== null
  );
}

/**
 * Build a "none" tier classification with stats
 */
function buildNoneClassification(
  qualifying: FactRecord[],
  intervals: number[],
  medianAmt: number | null
): RecurrenceClassification {
  const intervalMean = intervals.length > 0
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length
    : 0;

  const validStrict = intervals.filter(
    i => i >= MONTHLY_INTERVAL_MIN && i <= MONTHLY_INTERVAL_MAX
  ).length;
  const validLoose = intervals.filter(
    i => i >= MONTHLY_INTERVAL_MIN_LOOSE && i <= MONTHLY_INTERVAL_MAX_LOOSE
  ).length;

  return {
    isMonthly: false,
    tier: "none",
    confidence: 0,
    evidenceCount: qualifying.length,
    medianAmount: medianAmt,
    intervalStats: intervals.length > 0 ? {
      mean: intervalMean,
      stdDev: stdDev(intervals, intervalMean),
      withinRange: validStrict,
      withinLooseRange: validLoose,
    } : null,
  };
}

/**
 * Classify a single entity's transactions for monthly recurrence
 */
function classifyEntity(facts: FactRecord[]): RecurrenceClassification {
  // Filter to qualifying facts only
  const qualifying = facts.filter(isQualifyingFact);

  // Need at least MIN_OCCURRENCES for any classification
  if (qualifying.length < MIN_OCCURRENCES) {
    return buildNoneClassification(qualifying, [], null);
  }

  // Sort by date
  const sorted = [...qualifying].sort(
    (a, b) => new Date(a.dateValue!).getTime() - new Date(b.dateValue!).getTime()
  );

  // Calculate intervals between consecutive transactions
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(daysBetween(sorted[i - 1].dateValue!, sorted[i].dateValue!));
  }

  // Calculate amounts
  const amounts = qualifying.map((f) => Math.abs(f.amountValue!));
  const medianAmount = median(amounts);

  // Count intervals in strict range (28-33 days)
  const strictIntervals = intervals.filter(
    i => i >= MONTHLY_INTERVAL_MIN && i <= MONTHLY_INTERVAL_MAX
  );

  // Count intervals in loose range (28-35 days)
  const looseIntervals = intervals.filter(
    i => i >= MONTHLY_INTERVAL_MIN_LOOSE && i <= MONTHLY_INTERVAL_MAX_LOOSE
  );

  // Check amount stability for strict tier (±10%)
  const strictAmountStable = amounts.every((amount) => {
    if (medianAmount === 0) return true;
    const deviation = Math.abs(amount - medianAmount) / medianAmount;
    return deviation <= AMOUNT_TOLERANCE;
  });

  // Check amount stability for loose tier (±20%)
  const looseAmountStable = amounts.every((amount) => {
    if (medianAmount === 0) return true;
    const deviation = Math.abs(amount - medianAmount) / medianAmount;
    return deviation <= AMOUNT_TOLERANCE_LOOSE;
  });

  const intervalMean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const intervalStdDev = stdDev(intervals, intervalMean);

  // Try Tier 1 (strict) classification
  if (strictIntervals.length >= MIN_VALID_INTERVALS && strictAmountStable) {
    // Calculate strict confidence
    const intervalConsistency = strictIntervals.length / intervals.length;
    const amountDeviations = amounts.map((a) =>
      medianAmount > 0 ? Math.abs(a - medianAmount) / medianAmount : 0
    );
    const avgAmountDeviation = amountDeviations.reduce((a, b) => a + b, 0) / amountDeviations.length;
    const amountConsistency = 1 - avgAmountDeviation / AMOUNT_TOLERANCE;
    const evidenceBoost = Math.min(qualifying.length / 6, 1);

    // Strict tier confidence: minimum 0.85
    const rawConfidence = intervalConsistency * 0.5 + amountConsistency * 0.3 + evidenceBoost * 0.2;
    const confidence = Math.max(0.85, Math.min(1, rawConfidence));

    return {
      isMonthly: true,
      tier: "strict",
      confidence,
      evidenceCount: qualifying.length,
      medianAmount,
      intervalStats: {
        mean: intervalMean,
        stdDev: intervalStdDev,
        withinRange: strictIntervals.length,
        withinLooseRange: looseIntervals.length,
      },
    };
  }

  // Try Tier 2 (likely) classification
  // Requires more evidence (4+ occurrences) to compensate for looser rules
  if (
    qualifying.length >= MIN_OCCURRENCES_TIER2 &&
    looseIntervals.length >= MIN_VALID_INTERVALS &&
    looseAmountStable
  ) {
    // Calculate loose confidence (capped at 0.75)
    const intervalConsistency = looseIntervals.length / intervals.length;
    const amountDeviations = amounts.map((a) =>
      medianAmount > 0 ? Math.abs(a - medianAmount) / medianAmount : 0
    );
    const avgAmountDeviation = amountDeviations.reduce((a, b) => a + b, 0) / amountDeviations.length;
    const amountConsistency = 1 - avgAmountDeviation / AMOUNT_TOLERANCE_LOOSE;
    const evidenceBoost = Math.min((qualifying.length - 3) / 5, 1); // Starts counting from 4

    // Likely tier confidence: maximum 0.75
    const rawConfidence = intervalConsistency * 0.4 + amountConsistency * 0.3 + evidenceBoost * 0.3;
    const confidence = Math.min(0.75, Math.max(0.5, rawConfidence));

    return {
      isMonthly: true,
      tier: "likely",
      confidence,
      evidenceCount: qualifying.length,
      medianAmount,
      intervalStats: {
        mean: intervalMean,
        stdDev: intervalStdDev,
        withinRange: strictIntervals.length,
        withinLooseRange: looseIntervals.length,
      },
    };
  }

  // No classification
  return buildNoneClassification(qualifying, intervals, medianAmount);
}

/**
 * Classify monthly recurrence for all entities in a set of facts.
 *
 * Returns a map of entityKey -> RecurrenceClassification
 *
 * Only bank transactions (outflow, cleared) are considered.
 * Classification is conservative - prefers false negatives.
 */
export function classifyMonthlyByEntity(
  facts: FactRecord[]
): Map<string, RecurrenceClassification> {
  const result = new Map<string, RecurrenceClassification>();

  // Group facts by entity
  const byEntity = new Map<string, FactRecord[]>();
  for (const fact of facts) {
    const key = getEntityKey(fact);
    if (!byEntity.has(key)) {
      byEntity.set(key, []);
    }
    byEntity.get(key)!.push(fact);
  }

  // Classify each entity
  for (const [entityKey, entityFacts] of byEntity) {
    const classification = classifyEntity(entityFacts);
    result.set(entityKey, classification);
  }

  return result;
}

/**
 * Check if a specific entity is classified as monthly recurring (any tier).
 */
export function isEntityMonthly(
  entityKey: string,
  classifications: Map<string, RecurrenceClassification>
): boolean {
  const classification = classifications.get(entityKey);
  return classification?.isMonthly ?? false;
}

/**
 * Check if a specific entity has strict monthly classification (Tier 1).
 */
export function isEntityStrictMonthly(
  entityKey: string,
  classifications: Map<string, RecurrenceClassification>
): boolean {
  const classification = classifications.get(entityKey);
  return classification?.tier === "strict";
}

/**
 * Get derived recurrence for a fact based on entity classification.
 *
 * Returns "monthly" if the entity is classified as monthly (any tier),
 * otherwise returns the fact's stored recurrence.
 */
export function getDerivedRecurrence(
  fact: FactRecord,
  classifications: Map<string, RecurrenceClassification>
): string {
  const entityKey = getEntityKey(fact);
  const classification = classifications.get(entityKey);

  if (classification?.isMonthly) {
    return "monthly";
  }

  return fact.recurrence;
}
