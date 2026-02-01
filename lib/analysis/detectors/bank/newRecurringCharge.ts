/**
 * New Recurring Charge Detector
 *
 * Detects new recurring charges that started recently (within last 60 days).
 * This is informational - helps users identify new subscriptions/recurring bills.
 *
 * Rules:
 * - Uses derived monthly recurrence classification OR explicit recurrence
 * - Recurrence must have >=3 occurrences meeting monthly criteria
 * - First occurrence within last 60 days of dataset end date
 * - Only considers outflow + cleared transactions
 * - Excludes non-merchant transactions (transfers, payments, etc.)
 */

import { FactRecord, ProposedIssue } from "../../types";
import { RecurrenceClassification } from "../../recurrence/types";
import { isNonMerchantTransaction } from "../../exclusions";

const RECENT_DAYS_THRESHOLD = 60;
const MIN_OCCURRENCES = 3;
const HIGH_ANNUAL_THRESHOLD = 500;

interface NewRecurringChargeOptions {
  derivedRecurrence: Map<string, RecurrenceClassification>;
  datasetEndDate?: string;
}

function getEntityKey(fact: FactRecord): string {
  return fact.entityCanonical || fact.entityRaw || fact.entityName || "_unknown_";
}

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export function detectNewRecurringCharge(
  facts: FactRecord[],
  options: NewRecurringChargeOptions
): ProposedIssue[] {
  const issues: ProposedIssue[] = [];
  const { derivedRecurrence, datasetEndDate } = options;

  // Determine dataset end date (latest date in facts)
  let endDate = datasetEndDate;
  if (!endDate) {
    const dates = facts
      .filter((f) => f.dateValue)
      .map((f) => f.dateValue!)
      .sort();
    endDate = dates[dates.length - 1];
  }

  if (!endDate) {
    return []; // No dates to work with
  }

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

    // Must be classified as monthly with enough evidence
    if (!classification?.isMonthly || classification.evidenceCount < MIN_OCCURRENCES) {
      continue;
    }

    // Sort by date to find first occurrence
    const sorted = [...entityFacts].sort(
      (a, b) => new Date(a.dateValue!).getTime() - new Date(b.dateValue!).getTime()
    );

    const firstDate = sorted[0].dateValue!;
    const daysSinceFirst = daysBetween(firstDate, endDate);

    // First occurrence must be within last 60 days
    if (daysSinceFirst > RECENT_DAYS_THRESHOLD) {
      continue;
    }

    // Calculate monthly and annual amounts
    const medianAmount = classification.medianAmount;
    const currency = sorted[0].amountCurrency;
    const annualAmount = medianAmount ? medianAmount * 12 : null;

    // Determine severity based on annualized impact
    const severity = annualAmount && annualAmount > HIGH_ANNUAL_THRESHOLD ? "high" : "medium";

    // Build display name from first occurrence
    const displayName = sorted[0].entityName || entityKey;

    // Note the classification tier in rationale
    const tierNote = classification.tier === "strict"
      ? "Monthly cadence derived from transaction pattern (strict match)"
      : "Monthly cadence derived from transaction pattern (likely match, looser criteria)";

    const rationale: string[] = [
      `New monthly recurring charge started ${daysSinceFirst} days ago`,
      `${classification.evidenceCount} occurrences detected with consistent ~30-day intervals`,
      tierNote,
    ];

    if (medianAmount !== null && currency) {
      rationale.push(`Typical amount: ${currency} ${medianAmount.toFixed(2)}`);
      if (annualAmount !== null) {
        rationale.push(`Annualized: ${currency} ${annualAmount.toFixed(2)}`);
      }
    }

    issues.push({
      issueType: "new_recurring_charge",
      title: `New recurring charge detected: ${displayName}`,
      severity,
      confidence: classification.confidence,
      impactMin: medianAmount,
      impactMax: medianAmount,
      currency,
      rationale,
      evidenceFactIds: sorted.map((f) => f.id),
      entityName: displayName,
      evidenceSummary: `${classification.evidenceCount} charges from ${firstDate} to ${sorted[sorted.length - 1].dateValue}`,
      evidenceStats: {
        count: classification.evidenceCount,
        dateRange: {
          start: firstDate,
          end: sorted[sorted.length - 1].dateValue!,
        },
        medianAmount: classification.medianAmount,
        currency,
        sourceReferences: sorted.map((f) => f.sourceReference),
      },
    });
  }

  return issues;
}
