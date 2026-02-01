import { FactRecord, AnalysisResult, ProposedIssue } from "./types";
import {
  detectUnpaidInvoiceAging,
  detectRecurringPaymentGap,
  detectAmountDrift,
  detectDuplicateCharges,
  // Bank-specific detectors
  detectNewRecurringCharge,
  detectPriceCreep,
  detectBankDuplicateCharges,
  detectUnusualSpike,
  generateBankInsights,
  BankInsights,
} from "./detectors";
import { pruneIssues, PruneOptions, BANK_MODE_PRUNE_OPTIONS } from "./pruneIssues";
import { classifyMonthlyByEntity } from "./recurrence";
import { detectScanMode, ScanMode } from "./scanMode";
import { computeBankDiagnostics, BankDiagnostics } from "./diagnostics";

export interface AnalysisOptions {
  prune?: Partial<PruneOptions>;
  forceScanMode?: ScanMode; // For testing
}

export interface ExtendedAnalysisResult extends AnalysisResult {
  scanMode: ScanMode;
  bankInsights: BankInsights | null;
  bankDiagnostics: BankDiagnostics | null;
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

  // Detect scan mode
  const scanMode = options.forceScanMode || detectScanMode(facts);

  // Derive monthly recurrence classification for bank transactions
  // This is used by gap/drift detectors when stored recurrence is unknown
  const derivedRecurrence = classifyMonthlyByEntity(facts);

  // Bank insights and diagnostics (only for bank mode)
  let bankInsights: BankInsights | null = null;
  let bankDiagnostics: BankDiagnostics | null = null;

  if (scanMode === "bank") {
    // Bank mode: run bank-specific detectors
    bankInsights = generateBankInsights(facts, derivedRecurrence);
    bankDiagnostics = computeBankDiagnostics(facts, derivedRecurrence);

    const newRecurring = detectNewRecurringCharge(facts, { derivedRecurrence });
    rawIssues.push(...newRecurring);

    const priceCreep = detectPriceCreep(facts, { derivedRecurrence });
    rawIssues.push(...priceCreep);

    const duplicates = detectBankDuplicateCharges(facts);
    rawIssues.push(...duplicates);

    const spikes = detectUnusualSpike(facts);
    rawIssues.push(...spikes);

    // Build bank-mode "not flagged" list
    const outflowCount = facts.filter(
      (f) => f.direction === "outflow" && f.clearingStatus === "cleared"
    ).length;

    if (outflowCount >= 10 && newRecurring.length === 0) {
      notFlagged.push("No new recurring charges started in the last 60 days");
    }

    if (outflowCount >= 10 && priceCreep.length === 0) {
      notFlagged.push("No significant price increases detected on recurring charges");
    }

    if (outflowCount >= 2 && duplicates.length === 0) {
      notFlagged.push("No duplicate charges detected on the same day");
    }

    if (outflowCount >= 10 && spikes.length === 0) {
      notFlagged.push("No unusually high charges compared to merchant baselines");
    }

    if (bankInsights.recurringMerchantCount > 0) {
      notFlagged.push(
        `${bankInsights.recurringMerchantCount} recurring merchant(s) identified with stable patterns`
      );
    }
  } else {
    // Billing mode: run original detectors
    const unpaidAging = detectUnpaidInvoiceAging(facts);
    rawIssues.push(...unpaidAging);

    const paymentGaps = detectRecurringPaymentGap(facts, { derivedRecurrence });
    rawIssues.push(...paymentGaps);

    const amountDrifts = detectAmountDrift(facts, { derivedRecurrence });
    rawIssues.push(...amountDrifts);

    const duplicates = detectDuplicateCharges(facts);
    rawIssues.push(...duplicates);

    // Build billing-mode "not flagged" list
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
  }

  // Apply pruning options based on scan mode
  let pruneOptions = options.prune || {};
  if (scanMode === "bank") {
    // Bank mode uses tighter defaults
    pruneOptions = { ...BANK_MODE_PRUNE_OPTIONS, ...pruneOptions };

    // Dynamically adjust allowLowSeverity based on issue count
    // Only allow low severity if we have fewer than 3 issues
    const nonLowCount = rawIssues.filter((i) => i.severity !== "low").length;
    if (nonLowCount >= 3) {
      pruneOptions.allowLowSeverity = false;
    }
  }

  // Apply strictness policy: prune and cap issues
  const pruneResult = pruneIssues(rawIssues, pruneOptions);

  return {
    issues: pruneResult.issues,
    notFlagged,
    scanMode,
    bankInsights,
    bankDiagnostics,
    pruneStats: {
      totalBeforePrune: pruneResult.totalBeforePrune,
      droppedLowEvidence: pruneResult.droppedLowEvidence,
      droppedDuplicates: pruneResult.droppedDuplicates,
      droppedPerEntityCap: pruneResult.droppedPerEntityCap,
      droppedLowSeverity: pruneResult.droppedLowSeverity,
      droppedByCap: pruneResult.droppedByCap,
      wasCapped: pruneResult.wasCapped,
      maxIssues: pruneOptions.maxIssues ?? 8,
    },
  };
}
