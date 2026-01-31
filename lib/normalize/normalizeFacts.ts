import {
  Fact,
  FactType,
  DateType,
  Status,
  Recurrence,
  SourceType,
  Direction,
  ClearingStatus,
} from "@/lib/types";

const VALID_FACT_TYPES: FactType[] = [
  "invoice",
  "payment",
  "subscription",
  "discount",
  "note",
  "bank_transaction",
  "unknown",
];
const VALID_DATE_TYPES: DateType[] = [
  "issued",
  "due",
  "paid",
  "failed",
  "started",
  "ended",
  "posted",
  "unknown",
];
const VALID_DIRECTIONS: Direction[] = ["inflow", "outflow", "unknown"];
const VALID_CLEARING_STATUSES: ClearingStatus[] = [
  "cleared",
  "pending",
  "reversed",
  "unknown",
];
const VALID_STATUSES: Status[] = [
  "paid",
  "unpaid",
  "failed",
  "active",
  "canceled",
  "paused",
  "unknown",
];
const VALID_RECURRENCES: Recurrence[] = [
  "one_time",
  "monthly",
  "quarterly",
  "annual",
  "unknown",
];
const VALID_SOURCE_TYPES: SourceType[] = ["csv", "pdf", "image", "text"];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateEnum<T extends string>(
  value: unknown,
  validValues: T[],
  defaultValue: T
): T {
  if (typeof value === "string" && validValues.includes(value as T)) {
    return value as T;
  }
  return defaultValue;
}

function normalizeDate(dateValue: unknown): string | null {
  if (typeof dateValue !== "string" || !dateValue) {
    return null;
  }

  if (DATE_REGEX.test(dateValue)) {
    return dateValue;
  }

  try {
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
  } catch {
    // Invalid date, return null
  }

  return null;
}

function normalizeAmount(amount: unknown): { value: number | null; currency: string | null } {
  if (!amount || typeof amount !== "object") {
    return { value: null, currency: null };
  }

  const amountObj = amount as { value?: unknown; currency?: unknown };

  return {
    value:
      typeof amountObj.value === "number" && !isNaN(amountObj.value)
        ? amountObj.value
        : null,
    currency:
      typeof amountObj.currency === "string" && amountObj.currency.length > 0
        ? amountObj.currency.toUpperCase()
        : null,
  };
}

export function normalizeFact(fact: Fact): Fact {
  return {
    fact_id: fact.fact_id || crypto.randomUUID(),
    fact_type: validateEnum(fact.fact_type, VALID_FACT_TYPES, "unknown"),
    entity_name:
      typeof fact.entity_name === "string" && fact.entity_name.trim()
        ? fact.entity_name.trim()
        : null,
    amount: normalizeAmount(fact.amount),
    date: {
      value: normalizeDate(fact.date?.value),
      date_type: validateEnum(fact.date?.date_type, VALID_DATE_TYPES, "unknown"),
    },
    status: validateEnum(fact.status, VALID_STATUSES, "unknown"),
    recurrence: validateEnum(fact.recurrence, VALID_RECURRENCES, "unknown"),
    source_type: validateEnum(fact.source_type, VALID_SOURCE_TYPES, "text"),
    source_reference:
      typeof fact.source_reference === "string" ? fact.source_reference : "",
    confidence:
      typeof fact.confidence === "number" &&
      fact.confidence >= 0 &&
      fact.confidence <= 1
        ? fact.confidence
        : 0,
    notes:
      typeof fact.notes === "string" && fact.notes.trim()
        ? fact.notes.trim()
        : null,
    // Bank transaction specific fields
    direction: validateEnum(fact.direction, VALID_DIRECTIONS, "unknown"),
    clearing_status: validateEnum(
      fact.clearing_status,
      VALID_CLEARING_STATUSES,
      "unknown"
    ),
    raw_amount_text:
      typeof fact.raw_amount_text === "string" && fact.raw_amount_text.trim()
        ? fact.raw_amount_text.trim()
        : null,
  };
}

export function normalizeFacts(facts: Fact[]): Fact[] {
  return facts.map(normalizeFact);
}

export function filterLowConfidence(facts: Fact[], threshold = 0.6): Fact[] {
  return facts.filter((fact) => fact.confidence >= threshold);
}

export function normalizeAndFilter(facts: Fact[], confidenceThreshold = 0.6): Fact[] {
  const normalized = normalizeFacts(facts);
  return filterLowConfidence(normalized, confidenceThreshold);
}
