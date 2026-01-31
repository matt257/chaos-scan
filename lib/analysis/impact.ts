import { FactRecord } from "./types";

export interface ImpactResult {
  impactMin: number | null;
  impactMax: number | null;
  currency: string | null;
  reason: string | null; // Why impact couldn't be calculated (for rationale)
}

const NO_IMPACT: ImpactResult = {
  impactMin: null,
  impactMax: null,
  currency: null,
  reason: null,
};

/**
 * Check if all facts have consistent currency
 */
function getConsistentCurrency(facts: FactRecord[]): string | null {
  const currencies = facts
    .filter((f) => f.amountCurrency !== null)
    .map((f) => f.amountCurrency!);

  if (currencies.length === 0) return null;

  const unique = new Set(currencies);
  if (unique.size !== 1) return null; // Mixed currencies

  return currencies[0];
}

/**
 * Calculate median of an array of numbers
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Check if amounts are stable (within threshold of median)
 */
function areAmountsStable(amounts: number[], threshold: number = 0.1): boolean {
  if (amounts.length < 2) return false;

  const med = median(amounts);
  if (med === 0) return false;

  const maxDeviation = Math.max(
    ...amounts.map((a) => Math.abs(a - med) / med)
  );

  return maxDeviation <= threshold;
}

/**
 * Calculate impact for unpaid invoice aging
 * Requirements:
 * - All aged invoices must have amounts
 * - All must have the same currency (explicit)
 */
export function calculateUnpaidInvoiceImpact(
  agedInvoices: FactRecord[]
): ImpactResult {
  if (agedInvoices.length === 0) {
    return { ...NO_IMPACT, reason: "No aged invoices" };
  }

  // Check all invoices have amounts
  const withAmounts = agedInvoices.filter((f) => f.amountValue !== null);
  if (withAmounts.length !== agedInvoices.length) {
    return {
      ...NO_IMPACT,
      reason: "Some invoices missing amount values",
    };
  }

  // Check all have explicit currency
  const withCurrency = agedInvoices.filter((f) => f.amountCurrency !== null);
  if (withCurrency.length !== agedInvoices.length) {
    return {
      ...NO_IMPACT,
      reason: "Some invoices missing explicit currency",
    };
  }

  // Check consistent currency
  const currency = getConsistentCurrency(agedInvoices);
  if (!currency) {
    return {
      ...NO_IMPACT,
      reason: "Mixed currencies across invoices",
    };
  }

  const total = agedInvoices.reduce((sum, f) => sum + (f.amountValue || 0), 0);

  return {
    impactMin: total,
    impactMax: total,
    currency,
    reason: null,
  };
}

/**
 * Calculate impact for recurring payment gap
 * Requirements:
 * - Explicit monthly recurrence
 * - Amounts must be stable (within 10%)
 * - Explicit currency present
 * - At least 2 payments with amounts before the gap
 */
export function calculatePaymentGapImpact(
  paymentsBeforeGap: FactRecord[],
  monthsMissed: number
): ImpactResult {
  if (monthsMissed <= 0) {
    return { ...NO_IMPACT, reason: "No months missed" };
  }

  if (paymentsBeforeGap.length < 2) {
    return {
      ...NO_IMPACT,
      reason: "Insufficient payment history (need at least 2)",
    };
  }

  // Check all have explicit monthly recurrence
  const allMonthly = paymentsBeforeGap.every((p) => p.recurrence === "monthly");
  if (!allMonthly) {
    return {
      ...NO_IMPACT,
      reason: "Not all payments have explicit monthly recurrence",
    };
  }

  // Check all have amounts
  const withAmounts = paymentsBeforeGap.filter((p) => p.amountValue !== null);
  if (withAmounts.length !== paymentsBeforeGap.length) {
    return {
      ...NO_IMPACT,
      reason: "Some payments missing amount values",
    };
  }

  // Check all have explicit currency
  const withCurrency = paymentsBeforeGap.filter((p) => p.amountCurrency !== null);
  if (withCurrency.length !== paymentsBeforeGap.length) {
    return {
      ...NO_IMPACT,
      reason: "Some payments missing explicit currency",
    };
  }

  // Check consistent currency
  const currency = getConsistentCurrency(paymentsBeforeGap);
  if (!currency) {
    return {
      ...NO_IMPACT,
      reason: "Mixed currencies across payments",
    };
  }

  // Check amounts are stable
  const amounts = paymentsBeforeGap.map((p) => p.amountValue!);
  if (!areAmountsStable(amounts, 0.1)) {
    return {
      ...NO_IMPACT,
      reason: "Payment amounts not stable (>10% variance)",
    };
  }

  const medianAmount = median(amounts);
  const impact = medianAmount * monthsMissed;

  return {
    impactMin: impact,
    impactMax: impact,
    currency,
    reason: null,
  };
}

/**
 * Calculate impact for amount drift
 * Requirements:
 * - Explicit monthly recurrence
 * - Prior amounts must be stable
 * - Explicit currency present on all
 */
export function calculateDriftImpact(
  allPayments: FactRecord[],
  priorMedian: number,
  recentAvg: number
): ImpactResult {
  if (allPayments.length < 4) {
    return {
      ...NO_IMPACT,
      reason: "Insufficient payment history (need at least 4)",
    };
  }

  // Check all have explicit monthly recurrence
  const allMonthly = allPayments.every((p) => p.recurrence === "monthly");
  if (!allMonthly) {
    return {
      ...NO_IMPACT,
      reason: "Not all payments have explicit monthly recurrence",
    };
  }

  // Check all have explicit currency
  const withCurrency = allPayments.filter((p) => p.amountCurrency !== null);
  if (withCurrency.length !== allPayments.length) {
    return {
      ...NO_IMPACT,
      reason: "Some payments missing explicit currency",
    };
  }

  // Check consistent currency
  const currency = getConsistentCurrency(allPayments);
  if (!currency) {
    return {
      ...NO_IMPACT,
      reason: "Mixed currencies across payments",
    };
  }

  const monthlyDifference = priorMedian - recentAvg;
  if (monthlyDifference <= 0) {
    return {
      ...NO_IMPACT,
      reason: "No decrease detected",
    };
  }

  const annualImpact = monthlyDifference * 12;

  return {
    impactMin: annualImpact,
    impactMax: annualImpact,
    currency,
    reason: null,
  };
}

/**
 * Calculate impact for duplicate charges
 * Requirements:
 * - Explicit currency present
 * - Amount must be present
 */
export function calculateDuplicateImpact(
  duplicatePayments: FactRecord[]
): ImpactResult {
  if (duplicatePayments.length < 2) {
    return { ...NO_IMPACT, reason: "Not enough duplicates" };
  }

  // Check all have amounts
  const withAmounts = duplicatePayments.filter((p) => p.amountValue !== null);
  if (withAmounts.length !== duplicatePayments.length) {
    return {
      ...NO_IMPACT,
      reason: "Some payments missing amount values",
    };
  }

  // Check all have explicit currency
  const withCurrency = duplicatePayments.filter((p) => p.amountCurrency !== null);
  if (withCurrency.length !== duplicatePayments.length) {
    return {
      ...NO_IMPACT,
      reason: "Some payments missing explicit currency",
    };
  }

  // Check consistent currency
  const currency = getConsistentCurrency(duplicatePayments);
  if (!currency) {
    return {
      ...NO_IMPACT,
      reason: "Mixed currencies across payments",
    };
  }

  // Impact is the amount of duplicates (all but one)
  const amount = duplicatePayments[0].amountValue!;
  const duplicatedAmount = amount * (duplicatePayments.length - 1);

  return {
    impactMin: duplicatedAmount,
    impactMax: duplicatedAmount,
    currency,
    reason: null,
  };
}

/**
 * Format impact for display in rationale
 */
export function formatImpactRationale(impact: ImpactResult): string | null {
  if (impact.impactMin === null) {
    return impact.reason
      ? `Impact: unknown (${impact.reason.toLowerCase()})`
      : "Impact: unknown (insufficient evidence)";
  }

  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: impact.currency || "USD",
    maximumFractionDigits: 0,
  }).format(impact.impactMin);

  return `Estimated impact: ${formatted}`;
}
