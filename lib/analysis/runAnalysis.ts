import { FactRecord, AnalysisResult, ProposedIssue } from "./types";
import {
  detectUnpaidInvoiceAging,
  detectRecurringPaymentGap,
  detectAmountDrift,
  detectDuplicateCharges,
} from "./detectors";
import { pruneIssues, PruneOptions } from "./pruneIssues";
import { classifyMonthlyByEntity } from "./recurrence";

export interface AnalysisOptions {
  prune?: Partial<PruneOptions>;
}

export interface ExtendedAnalysisResult extends AnalysisResult {
  pruneStats: {
    totalBeforePrune: number;
    droppedLowEvidence: number;
    droppedDuplicates: number;
    droppedPerEntityCap: number;
    droppedLowSeverity: number;
    droppedByCap: number;
    wasCapped: boolean;
    maxIssues: number;
  };
}

export function runAnalysis(
  facts: FactRecord[],
  options: AnalysisOptions = {}
): ExtendedAnalysisResult {
  const rawIssues: ProposedIssue[] = [];
  const notFlagged: string[] = [];

  // Derive monthly recurrence classification for bank transactions
  // This is used by gap/drift detectors when stored recurrence is unknown
  const derivedRecurrence = classifyMonthlyByEntity(facts);

  // Run all detectors
  const unpaidAging = detectUnpaidInvoiceAging(facts);
  rawIssues.push(...unpaidAging);

  const paymentGaps = detectRecurringPaymentGap(facts, { derivedRecurrence });
  rawIssues.push(...paymentGaps);

  const amountDrifts = detectAmountDrift(facts, { derivedRecurrence });
  rawIssues.push(...amountDrifts);

  const duplicates = detectDuplicateCharges(facts);
  rawIssues.push(...duplicates);

  // Apply strictness policy: prune and cap issues
  const pruneResult = pruneIssues(rawIssues, options.prune);

  // Build "not flagged" list for transparency
  const invoiceCount = facts.filter((f) => f.factType === "invoice").length;
  const paymentCount = facts.filter((f) => f.factType === "payment").length;
  const subscriptionCount = facts.filter((f) => f.factType === "subscription").length;

  if (invoiceCount > 0 && unpaidAging.length === 0) {
    notFlagged.push("All invoices are current (none older than 45 days)");
  }

  if (paymentCount >= 3 && paymentGaps.length === 0) {
    notFlagged.push("No significant gaps detected in recurring payment patterns");
  }

  if (paymentCount >= 4 && amountDrifts.length === 0) {
    notFlagged.push("Recurring payment amounts are stable (no drift detected)");
  }

  if (paymentCount >= 2 && duplicates.length === 0) {
    notFlagged.push("No duplicate charges detected on the same day");
  }

  if (subscriptionCount > 0) {
    const activeSubscriptions = facts.filter(
      (f) => f.factType === "subscription" && f.status === "active"
    ).length;
    if (activeSubscriptions > 0) {
      notFlagged.push(`${activeSubscriptions} active subscription(s) confirmed`);
    }
  }

  return {
    issues: pruneResult.issues,
    notFlagged,
    pruneStats: {
      totalBeforePrune: pruneResult.totalBeforePrune,
      droppedLowEvidence: pruneResult.droppedLowEvidence,
      droppedDuplicates: pruneResult.droppedDuplicates,
      droppedPerEntityCap: pruneResult.droppedPerEntityCap,
      droppedLowSeverity: pruneResult.droppedLowSeverity,
      droppedByCap: pruneResult.droppedByCap,
      wasCapped: pruneResult.wasCapped,
      maxIssues: options.prune?.maxIssues ?? 8,
    },
  };
}
