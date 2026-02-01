/**
 * Bank Insights Generator
 *
 * Generates informational insights for bank mode scans.
 * These are NOT issues - they're summary statistics.
 */

import { FactRecord } from "../../types";
import { RecurrenceClassification } from "../../recurrence/types";

export interface BankInsights {
  recurringMerchantCount: number;
  recurringMerchants: Array<{
    name: string;
    monthlyAmount: number | null;
    currency: string | null;
    occurrences: number;
  }>;
  totalMonthlyRecurring: number | null;
  recurringCurrency: string | null;
  canSumRecurring: boolean;
  totalTransactions: number;
  totalOutflows: number;
  dateRange: { start: string; end: string } | null;
}

function getEntityKey(fact: FactRecord): string {
  return fact.entityCanonical || fact.entityRaw || fact.entityName || "_unknown_";
}

function getDisplayName(facts: FactRecord[], entityKey: string): string {
  const first = facts.find((f) => getEntityKey(f) === entityKey);
  return first?.entityName || entityKey;
}

export function generateBankInsights(
  facts: FactRecord[],
  derivedRecurrence: Map<string, RecurrenceClassification>
): BankInsights {
  // Filter to outflow + cleared
  const outflows = facts.filter(
    (f) =>
      f.direction === "outflow" &&
      f.clearingStatus === "cleared" &&
      f.amountValue !== null
  );

  // Get date range
  const dates = facts
    .filter((f) => f.dateValue)
    .map((f) => f.dateValue!)
    .sort();
  const dateRange = dates.length > 0
    ? { start: dates[0], end: dates[dates.length - 1] }
    : null;

  // Find monthly recurring merchants
  const recurringMerchants: Array<{
    name: string;
    monthlyAmount: number | null;
    currency: string | null;
    occurrences: number;
  }> = [];

  let currencies = new Set<string>();

  for (const [entityKey, classification] of derivedRecurrence) {
    if (!classification.isMonthly) {
      continue;
    }

    // Find facts for this entity to get currency
    const entityFacts = outflows.filter((f) => getEntityKey(f) === entityKey);
    const currency = entityFacts[0]?.amountCurrency || null;

    if (currency) {
      currencies.add(currency);
    }

    recurringMerchants.push({
      name: getDisplayName(facts, entityKey),
      monthlyAmount: classification.medianAmount,
      currency,
      occurrences: classification.evidenceCount,
    });
  }

  // Sort by monthly amount (descending)
  recurringMerchants.sort((a, b) => (b.monthlyAmount || 0) - (a.monthlyAmount || 0));

  // Can we sum recurring? Only if all have amounts and same currency
  const canSumRecurring =
    recurringMerchants.length > 0 &&
    currencies.size === 1 &&
    recurringMerchants.every((m) => m.monthlyAmount !== null);

  let totalMonthlyRecurring: number | null = null;
  let recurringCurrency: string | null = null;

  if (canSumRecurring) {
    totalMonthlyRecurring = recurringMerchants.reduce(
      (sum, m) => sum + (m.monthlyAmount || 0),
      0
    );
    recurringCurrency = recurringMerchants[0]?.currency || null;
  }

  return {
    recurringMerchantCount: recurringMerchants.length,
    recurringMerchants,
    totalMonthlyRecurring,
    recurringCurrency,
    canSumRecurring,
    totalTransactions: facts.length,
    totalOutflows: outflows.length,
    dateRange,
  };
}
