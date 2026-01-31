import { FactRecord, AnalysisResult, ProposedIssue } from "./types";
import {
  detectUnpaidInvoiceAging,
  detectRecurringPaymentGap,
  detectAmountDrift,
  detectDuplicateCharges,
} from "./detectors";

export function runAnalysis(facts: FactRecord[]): AnalysisResult {
  const issues: ProposedIssue[] = [];
  const notFlagged: string[] = [];

  // Run all detectors
  const unpaidAging = detectUnpaidInvoiceAging(facts);
  issues.push(...unpaidAging);

  const paymentGaps = detectRecurringPaymentGap(facts);
  issues.push(...paymentGaps);

  const amountDrifts = detectAmountDrift(facts);
  issues.push(...amountDrifts);

  const duplicates = detectDuplicateCharges(facts);
  issues.push(...duplicates);

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

  // Sort issues by severity (high first) then by confidence
  const severityOrder = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.confidence - a.confidence;
  });

  return { issues, notFlagged };
}
