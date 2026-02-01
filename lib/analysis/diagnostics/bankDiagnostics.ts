/**
 * Bank Scan Diagnostics
 *
 * Computes detailed statistics about why a bank scan may have produced
 * few or no issues. Helps users understand data coverage and detector
 * eligibility.
 */

import { FactRecord } from "../types";
import { RecurrenceClassification } from "../recurrence/types";
import { isNonMerchantTransaction, checkExclusion } from "../exclusions";

export interface BankDiagnostics {
  // Basic counts
  totalFacts: number;
  bankFacts: number; // direction !== 'unknown'

  // Date coverage
  withDateCount: number;
  missingDateCount: number;
  dateParseFailureRate: number; // 0-1

  // Amount coverage
  withAmountCount: number;
  missingAmountCount: number;

  // Qualifying facts
  outflowClearedCount: number;
  qualifyingForAnalysis: number; // outflow + cleared + date + amount

  // Merchant analysis
  uniqueMerchants: number;
  excludedMerchantCount: number;
  excludedMerchantRate: number; // 0-1
  excludedMerchants: string[]; // Top 5 for display

  // Recurrence candidates
  candidateRecurringMerchants: number; // >=3 dated outflows
  derivedMonthlyMerchantsCount: number;

  // Detector eligibility
  detectorEligibility: {
    newRecurringEligible: number;
    priceCreepEligible: number;
    spikeEligible: number;
    duplicateEligible: number;
  };

  // Top blockers - human-readable strings explaining why no issues
  topBlockers: string[];
}

function getEntityKey(fact: FactRecord): string {
  return fact.entityCanonical || fact.entityRaw || fact.entityName || "_unknown_";
}

/**
 * Compute detailed diagnostics for a bank scan
 */
export function computeBankDiagnostics(
  facts: FactRecord[],
  derivedRecurrence: Map<string, RecurrenceClassification>
): BankDiagnostics {
  const totalFacts = facts.length;

  // Bank facts: direction is known
  const bankFacts = facts.filter(
    f => f.direction === "inflow" || f.direction === "outflow"
  ).length;

  // Date coverage
  const withDateCount = facts.filter(f => f.dateValue !== null).length;
  const missingDateCount = totalFacts - withDateCount;
  const dateParseFailureRate = totalFacts > 0 ? missingDateCount / totalFacts : 0;

  // Amount coverage
  const withAmountCount = facts.filter(f => f.amountValue !== null).length;
  const missingAmountCount = totalFacts - withAmountCount;

  // Outflow + cleared
  const outflowCleared = facts.filter(
    f => f.direction === "outflow" && f.clearingStatus === "cleared"
  );
  const outflowClearedCount = outflowCleared.length;

  // Qualifying for analysis: outflow + cleared + date + amount
  const qualifying = outflowCleared.filter(
    f => f.dateValue !== null && f.amountValue !== null
  );
  const qualifyingForAnalysis = qualifying.length;

  // Unique merchants
  const merchantSet = new Set<string>();
  const excludedSet = new Set<string>();

  for (const fact of facts) {
    const key = getEntityKey(fact);
    if (key !== "_unknown_") {
      merchantSet.add(key);
      if (isNonMerchantTransaction(key)) {
        excludedSet.add(key);
      }
    }
  }

  const uniqueMerchants = merchantSet.size;
  const excludedMerchantCount = excludedSet.size;
  const excludedMerchantRate = uniqueMerchants > 0 ? excludedMerchantCount / uniqueMerchants : 0;
  const excludedMerchants = Array.from(excludedSet).slice(0, 5);

  // Merchants with 3+ dated outflows (recurrence candidates)
  const merchantOutflowCounts = new Map<string, number>();
  for (const fact of qualifying) {
    const key = getEntityKey(fact);
    if (!isNonMerchantTransaction(key)) {
      merchantOutflowCounts.set(key, (merchantOutflowCounts.get(key) || 0) + 1);
    }
  }

  const candidateRecurringMerchants = Array.from(merchantOutflowCounts.values())
    .filter(count => count >= 3).length;

  // Derived monthly count
  let derivedMonthlyMerchantsCount = 0;
  for (const [, classification] of derivedRecurrence) {
    if (classification.isMonthly) {
      derivedMonthlyMerchantsCount++;
    }
  }

  // Detector eligibility
  const detectorEligibility = computeDetectorEligibility(
    qualifying,
    merchantOutflowCounts,
    derivedRecurrence
  );

  // Compute top blockers
  const topBlockers = computeTopBlockers({
    totalFacts,
    bankFacts,
    dateParseFailureRate,
    qualifyingForAnalysis,
    candidateRecurringMerchants,
    derivedMonthlyMerchantsCount,
    excludedMerchantRate,
    detectorEligibility,
  });

  return {
    totalFacts,
    bankFacts,
    withDateCount,
    missingDateCount,
    dateParseFailureRate,
    withAmountCount,
    missingAmountCount,
    outflowClearedCount,
    qualifyingForAnalysis,
    uniqueMerchants,
    excludedMerchantCount,
    excludedMerchantRate,
    excludedMerchants,
    candidateRecurringMerchants,
    derivedMonthlyMerchantsCount,
    detectorEligibility,
    topBlockers,
  };
}

interface DetectorEligibility {
  newRecurringEligible: number;
  priceCreepEligible: number;
  spikeEligible: number;
  duplicateEligible: number;
}

function computeDetectorEligibility(
  qualifying: FactRecord[],
  merchantCounts: Map<string, number>,
  derivedRecurrence: Map<string, RecurrenceClassification>
): DetectorEligibility {
  // New recurring: need derived monthly classification
  let newRecurringEligible = 0;
  for (const [entityKey, classification] of derivedRecurrence) {
    if (classification.isMonthly && classification.evidenceCount >= 3) {
      if (!isNonMerchantTransaction(entityKey)) {
        newRecurringEligible++;
      }
    }
  }

  // Price creep: need 4+ occurrences
  let priceCreepEligible = 0;
  for (const [entityKey, count] of merchantCounts) {
    if (count >= 4 && !isNonMerchantTransaction(entityKey)) {
      priceCreepEligible++;
    }
  }

  // Spike: need 7+ occurrences (6 history + 1 current)
  let spikeEligible = 0;
  for (const [entityKey, count] of merchantCounts) {
    if (count >= 7 && !isNonMerchantTransaction(entityKey)) {
      spikeEligible++;
    }
  }

  // Duplicate: just need 2+ facts on same day with same amount
  // Count groups that could be duplicates
  const duplicateGroups = new Map<string, number>();
  for (const fact of qualifying) {
    const key = `${getEntityKey(fact)}|${fact.dateValue}|${fact.amountValue}`;
    duplicateGroups.set(key, (duplicateGroups.get(key) || 0) + 1);
  }
  const duplicateEligible = Array.from(duplicateGroups.values())
    .filter(count => count >= 2).length;

  return {
    newRecurringEligible,
    priceCreepEligible,
    spikeEligible,
    duplicateEligible,
  };
}

interface BlockerInput {
  totalFacts: number;
  bankFacts: number;
  dateParseFailureRate: number;
  qualifyingForAnalysis: number;
  candidateRecurringMerchants: number;
  derivedMonthlyMerchantsCount: number;
  excludedMerchantRate: number;
  detectorEligibility: DetectorEligibility;
}

function computeTopBlockers(input: BlockerInput): string[] {
  const blockers: string[] = [];

  // Check for high date parse failure
  if (input.dateParseFailureRate > 0.5) {
    const pct = Math.round(input.dateParseFailureRate * 100);
    blockers.push(
      `${pct}% of transactions are missing a parseable date. ` +
      `Your export may use an unsupported date format.`
    );
  }

  // Check if no bank facts at all
  if (input.totalFacts > 0 && input.bankFacts === 0) {
    blockers.push(
      `No transactions have direction (inflow/outflow) detected. ` +
      `The CSV format may not be recognized as bank data.`
    );
  }

  // Check for low qualifying facts
  if (input.qualifyingForAnalysis < 10 && input.totalFacts > 0) {
    blockers.push(
      `Only ${input.qualifyingForAnalysis} transactions qualify for analysis ` +
      `(need outflow + cleared + date + amount).`
    );
  }

  // Check for no recurrence candidates
  if (input.candidateRecurringMerchants === 0 && input.qualifyingForAnalysis >= 10) {
    blockers.push(
      `No merchants have 3+ dated outflows needed for recurrence detection.`
    );
  }

  // Check if recurrence classification is failing
  if (input.candidateRecurringMerchants > 0 && input.derivedMonthlyMerchantsCount === 0) {
    blockers.push(
      `${input.candidateRecurringMerchants} merchant(s) have enough history ` +
      `but none met strict monthly criteria (28-33 day intervals, ±10% amount).`
    );
  }

  // Check for high exclusion rate
  if (input.excludedMerchantRate > 0.5) {
    const pct = Math.round(input.excludedMerchantRate * 100);
    blockers.push(
      `${pct}% of merchants matched exclusion patterns (transfers, payments). ` +
      `This is unusually high and may indicate overreach.`
    );
  }

  // Check detector eligibility
  const { newRecurringEligible, priceCreepEligible, spikeEligible, duplicateEligible } =
    input.detectorEligibility;

  if (newRecurringEligible === 0 && priceCreepEligible === 0 &&
      spikeEligible === 0 && duplicateEligible === 0) {
    blockers.push(
      `No merchants are eligible for any detector. ` +
      `This typically means insufficient transaction history or missing dates.`
    );
  }

  // If no blockers but still no issues, add a generic message
  if (blockers.length === 0) {
    blockers.push(
      `Data coverage looks adequate. ` +
      `No issues were detected because all patterns appear normal.`
    );
  }

  return blockers;
}

/**
 * Generate a short summary of diagnostics for display
 */
export function summarizeDiagnostics(diagnostics: BankDiagnostics): string {
  const parts: string[] = [];

  parts.push(`${diagnostics.totalFacts} transactions analyzed`);

  if (diagnostics.dateParseFailureRate > 0.1) {
    const pct = Math.round(diagnostics.dateParseFailureRate * 100);
    parts.push(`${pct}% missing dates`);
  }

  parts.push(`${diagnostics.qualifyingForAnalysis} qualifying for analysis`);
  parts.push(`${diagnostics.derivedMonthlyMerchantsCount} recurring merchants found`);

  return parts.join(" · ");
}
