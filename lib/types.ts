export type FactType = "invoice" | "payment" | "subscription" | "discount" | "note" | "bank_transaction" | "unknown";
export type DateType = "issued" | "due" | "paid" | "failed" | "started" | "ended" | "posted" | "unknown";
export type Status = "paid" | "unpaid" | "failed" | "active" | "canceled" | "paused" | "unknown";
export type Recurrence = "one_time" | "monthly" | "quarterly" | "annual" | "unknown";
export type SourceType = "csv" | "pdf" | "image" | "text";
export type ExtractionConfidence = "high" | "medium" | "low";

// Bank transaction specific types
export type Direction = "inflow" | "outflow" | "unknown";
export type ClearingStatus = "cleared" | "pending" | "reversed" | "unknown";

export type Fact = {
  fact_id: string;
  fact_type: FactType;
  entity_name: string | null;
  amount: { value: number | null; currency: string | null };
  date: { value: string | null; date_type: DateType };
  status: Status;
  recurrence: Recurrence;
  source_type: SourceType;
  source_reference: string;
  confidence: number; // 0.0–1.0
  notes: string | null;
  // Bank transaction specific fields
  direction: Direction;
  clearing_status: ClearingStatus;
  raw_amount_text: string | null;
};

export type ExtractionResult = {
  facts: Fact[];
  warnings: string[];
  extraction_confidence: ExtractionConfidence;
};
