import { FactRecord } from "./types";

export interface EvidenceStats {
  count: number;
  dateRange: { start: string; end: string } | null;
  medianAmount: number | null;
  currency: string | null;
  sourceReferences: string[];
}

export interface EvidenceSummaryResult {
  summary: string;
  stats: EvidenceStats;
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

function formatMonth(dateStr: string): string {
  const date = parseDate(dateStr);
  return date.toLocaleString("en-US", { month: "short" });
}

function formatMonthYear(dateStr: string): string {
  const date = parseDate(dateStr);
  return date.toLocaleString("en-US", { month: "short", year: "numeric" });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatAmount(amount: number, currency: string | null): string {
  const curr = currency || "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Compute evidence statistics from a list of facts
 */
export function computeEvidenceStats(facts: FactRecord[]): EvidenceStats {
  if (facts.length === 0) {
    return {
      count: 0,
      dateRange: null,
      medianAmount: null,
      currency: null,
      sourceReferences: [],
    };
  }

  // Get date range
  const factsWithDates = facts.filter((f) => f.dateValue);
  let dateRange: { start: string; end: string } | null = null;
  if (factsWithDates.length > 0) {
    const sorted = [...factsWithDates].sort(
      (a, b) => parseDate(a.dateValue!).getTime() - parseDate(b.dateValue!).getTime()
    );
    dateRange = {
      start: sorted[0].dateValue!,
      end: sorted[sorted.length - 1].dateValue!,
    };
  }

  // Get median amount
  const amounts = facts
    .filter((f) => f.amountValue !== null)
    .map((f) => f.amountValue!);
  const medianAmount = amounts.length > 0 ? median(amounts) : null;

  // Get currency (use first non-null, or null if mixed)
  const currencies = [...new Set(facts.map((f) => f.amountCurrency).filter(Boolean))];
  const currency = currencies.length === 1 ? currencies[0] : null;

  // Get source references
  const sourceReferences = facts.map((f) => f.sourceReference);

  return {
    count: facts.length,
    dateRange,
    medianAmount,
    currency,
    sourceReferences,
  };
}

/**
 * Generate a human-readable evidence summary for unpaid invoice aging
 */
export function generateUnpaidInvoiceSummary(
  facts: FactRecord[],
  oldestDays: number
): EvidenceSummaryResult {
  const stats = computeEvidenceStats(facts);

  let summary = `${stats.count} unpaid invoice${stats.count !== 1 ? "s" : ""}`;

  if (stats.dateRange) {
    const startMonth = formatMonth(stats.dateRange.start);
    const endMonth = formatMonth(stats.dateRange.end);
    if (startMonth === endMonth) {
      summary += ` from ${startMonth}`;
    } else {
      summary += ` from ${startMonth}–${endMonth}`;
    }
  }

  if (stats.medianAmount !== null) {
    summary += `, median ${formatAmount(stats.medianAmount, stats.currency)}`;
  }

  summary += `, oldest ${oldestDays} days`;

  return { summary, stats };
}

/**
 * Generate a human-readable evidence summary for recurring payment gap
 */
export function generatePaymentGapSummary(
  facts: FactRecord[],
  gapDays: number,
  gapAfterDate: string
): EvidenceSummaryResult {
  const stats = computeEvidenceStats(facts);

  let summary = `${stats.count} payment${stats.count !== 1 ? "s" : ""}`;

  if (stats.dateRange) {
    const startMonth = formatMonth(stats.dateRange.start);
    const endMonth = formatMonth(stats.dateRange.end);
    if (startMonth === endMonth) {
      summary += ` in ${startMonth}`;
    } else {
      summary += ` from ${startMonth}–${endMonth}`;
    }
  }

  summary += `, then ${gapDays}-day gap`;

  return { summary, stats };
}

/**
 * Generate a human-readable evidence summary for amount drift
 */
export function generateAmountDriftSummary(
  facts: FactRecord[],
  priorMedian: number,
  recentAvg: number,
  driftPercent: number
): EvidenceSummaryResult {
  const stats = computeEvidenceStats(facts);

  let summary = `${stats.count} payment${stats.count !== 1 ? "s" : ""}`;

  if (stats.dateRange) {
    const startMonth = formatMonth(stats.dateRange.start);
    const endMonth = formatMonth(stats.dateRange.end);
    if (startMonth === endMonth) {
      summary += ` in ${startMonth}`;
    } else {
      summary += ` from ${startMonth}–${endMonth}`;
    }
  }

  summary += `, dropped ${driftPercent.toFixed(0)}% (${formatAmount(priorMedian, stats.currency)} → ${formatAmount(recentAvg, stats.currency)})`;

  return { summary, stats };
}

/**
 * Generate a human-readable evidence summary for duplicate charges
 */
export function generateDuplicateSummary(
  facts: FactRecord[],
  date: string
): EvidenceSummaryResult {
  const stats = computeEvidenceStats(facts);

  let summary = `${stats.count} identical charge${stats.count !== 1 ? "s" : ""}`;

  summary += ` on ${formatMonthYear(date)}`;

  if (stats.medianAmount !== null) {
    summary += `, ${formatAmount(stats.medianAmount, stats.currency)} each`;
  }

  return { summary, stats };
}
