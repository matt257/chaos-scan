/**
 * Conservative Monthly Recurrence Classifier
 *
 * Derives monthly recurrence classification for bank transactions using
 * strict deterministic rules. Prefers false negatives over false positives.
 *
 * Classification criteria:
 * - Only considers outflow transactions
 * - Only considers cleared transactions (ignores pending/reversed)
 * - Requires amount and date to be present
 * - Requires >= 3 occurrences
 * - Requires >= 2 consecutive intervals within 28-33 days
 * - Requires amounts within ±10% of median
 */

import { FactRecord } from "../types";
import {
  RecurrenceClassification,
  MONTHLY_INTERVAL_MIN,
  MONTHLY_INTERVAL_MAX,
  AMOUNT_TOLERANCE,
  MIN_OCCURRENCES,
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
 * Classify a single entity's transactions for monthly recurrence
 */
function classifyEntity(facts: FactRecord[]): RecurrenceClassification {
  // Filter to qualifying facts only
  const qualifying = facts.filter(isQualifyingFact);

  // Need at least MIN_OCCURRENCES
  if (qualifying.length < MIN_OCCURRENCES) {
    return {
      isMonthly: false,
      confidence: 0,
      evidenceCount: qualifying.length,
      medianAmount: null,
      intervalStats: null,
    };
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

  // Count intervals within monthly range (28-33 days)
  const validIntervals = intervals.filter(
    (interval) => interval >= MONTHLY_INTERVAL_MIN && interval <= MONTHLY_INTERVAL_MAX
  );

  // Need at least MIN_VALID_INTERVALS consecutive monthly intervals
  if (validIntervals.length < MIN_VALID_INTERVALS) {
    const intervalMean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return {
      isMonthly: false,
      confidence: 0,
      evidenceCount: qualifying.length,
      medianAmount: median(qualifying.map((f) => Math.abs(f.amountValue!))),
      intervalStats: {
        mean: intervalMean,
        stdDev: stdDev(intervals, intervalMean),
        withinRange: validIntervals.length,
      },
    };
  }

  // Check amount stability - all amounts within ±10% of median
  const amounts = qualifying.map((f) => Math.abs(f.amountValue!));
  const medianAmount = median(amounts);

  const amountsStable = amounts.every((amount) => {
    const deviation = Math.abs(amount - medianAmount) / medianAmount;
    return deviation <= AMOUNT_TOLERANCE;
  });

  if (!amountsStable) {
    const intervalMean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return {
      isMonthly: false,
      confidence: 0,
      evidenceCount: qualifying.length,
      medianAmount,
      intervalStats: {
        mean: intervalMean,
        stdDev: stdDev(intervals, intervalMean),
        withinRange: validIntervals.length,
      },
    };
  }

  // Calculate confidence based on:
  // - Proportion of intervals within range
  // - Amount stability
  // - Number of occurrences
  const intervalMean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const intervalStdDev = stdDev(intervals, intervalMean);

  // Interval consistency (how many intervals are within range)
  const intervalConsistency = validIntervals.length / intervals.length;

  // Amount consistency (how tight are the amounts around median)
  const amountDeviations = amounts.map((a) => Math.abs(a - medianAmount) / medianAmount);
  const avgAmountDeviation = amountDeviations.reduce((a, b) => a + b, 0) / amountDeviations.length;
  const amountConsistency = 1 - avgAmountDeviation / AMOUNT_TOLERANCE;

  // Evidence boost (more occurrences = higher confidence, capped)
  const evidenceBoost = Math.min(qualifying.length / 6, 1); // Max boost at 6+ occurrences

  // Combined confidence (weighted average)
  const confidence = Math.min(
    1,
    intervalConsistency * 0.5 + amountConsistency * 0.3 + evidenceBoost * 0.2
  );

  return {
    isMonthly: true,
    confidence,
    evidenceCount: qualifying.length,
    medianAmount,
    intervalStats: {
      mean: intervalMean,
      stdDev: intervalStdDev,
      withinRange: validIntervals.length,
    },
  };
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
 * Check if a specific entity is classified as monthly recurring.
 *
 * Helper function for detectors to quickly check classification.
 */
export function isEntityMonthly(
  entityKey: string,
  classifications: Map<string, RecurrenceClassification>
): boolean {
  const classification = classifications.get(entityKey);
  return classification?.isMonthly ?? false;
}

/**
 * Get derived recurrence for a fact based on entity classification.
 *
 * Returns "monthly" if the entity is classified as monthly,
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
