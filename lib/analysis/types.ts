export type Severity = "high" | "medium" | "low";

export type IssueType =
  | "unpaid_invoice_aging"
  | "recurring_payment_gap"
  | "amount_drift"
  | "duplicate_charge"
  // Bank-specific issue types
  | "new_recurring_charge"
  | "price_creep"
  | "unusual_spike";

export interface EvidenceStats {
  count: number;
  dateRange: { start: string; end: string } | null;
  medianAmount: number | null;
  currency: string | null;
  sourceReferences: string[];
}

export interface ProposedIssue {
  issueType: IssueType;
  title: string;
  severity: Severity;
  confidence: number;
  impactMin: number | null;
  impactMax: number | null;
  currency: string | null;
  rationale: string[];
  evidenceFactIds: string[];
  entityName: string | null;
  evidenceSummary: string | null;
  evidenceStats: EvidenceStats | null;
}

export interface FactRecord {
  id: string;
  factType: string;
  entityName: string | null;
  entityRaw: string | null;         // Original entity name before normalization
  entityCanonical: string | null;   // Normalized entity name for grouping
  amountValue: number | null;
  amountCurrency: string | null;
  dateValue: string | null;
  dateType: string | null;
  status: string;
  recurrence: string;
  sourceReference: string;
  confidence: number;
  // Bank transaction specific fields
  direction: string;
  clearingStatus: string;
}

export interface AnalysisResult {
  issues: ProposedIssue[];
  notFlagged: string[];
}

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  unpaid_invoice_aging: "Unpaid Invoice Aging",
  recurring_payment_gap: "Recurring Payment Gap",
  amount_drift: "Amount Drift",
  duplicate_charge: "Possible Duplicate Charge",
  // Bank-specific labels
  new_recurring_charge: "New Recurring Charge",
  price_creep: "Price Increase",
  unusual_spike: "Unusual Charge Amount",
};
