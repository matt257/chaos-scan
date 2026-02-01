/**
 * Recurrence Classification Types
 *
 * Types for derived recurrence classification based on transaction patterns.
 *
 * Two-tier classification:
 * - Tier 1 (strict): 28-33 days, ±10% amount, used for price creep/gaps
 * - Tier 2 (likely): 28-35 days, ±20% amount, used for new recurring detection
 */

export type RecurrenceTier = "strict" | "likely" | "none";

export interface RecurrenceClassification {
  isMonthly: boolean;        // True if tier is "strict" or "likely"
  tier: RecurrenceTier;      // Classification tier
  confidence: number;        // 0-1, based on interval and amount consistency
  evidenceCount: number;     // Number of qualifying transactions
  medianAmount: number | null;
  intervalStats: {
    mean: number;            // Mean interval in days
    stdDev: number;          // Standard deviation of intervals
    withinRange: number;     // Count of intervals within strict range
    withinLooseRange: number; // Count of intervals within loose range
  } | null;
}

export interface EntityRecurrenceMap {
  // Keyed by entityCanonical (or entityKey)
  [entityKey: string]: RecurrenceClassification;
}

// Tier 1 (strict) - used for price creep, gaps
export const MONTHLY_INTERVAL_MIN = 28;
export const MONTHLY_INTERVAL_MAX = 33;
export const AMOUNT_TOLERANCE = 0.10; // 10%

// Tier 2 (likely) - used for new recurring detection
export const MONTHLY_INTERVAL_MIN_LOOSE = 28;
export const MONTHLY_INTERVAL_MAX_LOOSE = 35;
export const AMOUNT_TOLERANCE_LOOSE = 0.20; // 20%

export const MIN_OCCURRENCES = 3;
export const MIN_OCCURRENCES_TIER2 = 4; // Tier 2 needs more evidence
export const MIN_VALID_INTERVALS = 2;
