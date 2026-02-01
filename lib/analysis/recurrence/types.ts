/**
 * Recurrence Classification Types
 *
 * Types for derived recurrence classification based on transaction patterns.
 */

export interface RecurrenceClassification {
  isMonthly: boolean;
  confidence: number;        // 0-1, based on interval and amount consistency
  evidenceCount: number;     // Number of qualifying transactions
  medianAmount: number | null;
  intervalStats: {
    mean: number;            // Mean interval in days
    stdDev: number;          // Standard deviation of intervals
    withinRange: number;     // Count of intervals within 28-33 days
  } | null;
}

export interface EntityRecurrenceMap {
  // Keyed by entityCanonical (or entityKey)
  [entityKey: string]: RecurrenceClassification;
}

export const MONTHLY_INTERVAL_MIN = 28;
export const MONTHLY_INTERVAL_MAX = 33;
export const AMOUNT_TOLERANCE = 0.10; // 10%
export const MIN_OCCURRENCES = 3;
export const MIN_VALID_INTERVALS = 2;
