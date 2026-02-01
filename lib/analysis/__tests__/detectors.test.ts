import { describe, it, expect } from "vitest";
import { detectUnpaidInvoiceAging } from "../detectors/unpaidInvoiceAging";
import { detectRecurringPaymentGap } from "../detectors/recurringPaymentGap";
import { detectAmountDrift } from "../detectors/amountDrift";
import { detectDuplicateCharges } from "../detectors/duplicateCharges";
import { FactRecord } from "../types";

// Helper to create a date string N days ago
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

// Helper to create a date string for a specific month
function monthDate(year: number, month: number, day: number = 15): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Helper to add default bank/entity fields to fact arrays
type FactWithoutExtraFields = Omit<FactRecord, "direction" | "clearingStatus" | "entityRaw" | "entityCanonical">;
function f(facts: FactWithoutExtraFields[]): FactRecord[] {
  return facts.map((fact) => ({
    ...fact,
    entityRaw: fact.entityName,
    entityCanonical: fact.entityName?.toUpperCase() || null,
    direction: "unknown",
    clearingStatus: "unknown",
  }));
}

describe("detectUnpaidInvoiceAging", () => {
  it("should return empty array when no invoices exist", () => {
    const facts = f([
      {
        id: "1",
        factType: "payment",
        entityName: "Acme",
        amountValue: 100,
        amountCurrency: "USD",
        dateValue: daysAgo(10),
        dateType: "paid",
        status: "paid",
        recurrence: "one_time",
        sourceReference: "row 1",
        confidence: 0.9,
      },
    ]);
    const issues = detectUnpaidInvoiceAging(facts);
    expect(issues).toHaveLength(0);
  });

  it("should not flag invoices less than 45 days old", () => {
    const facts = f([
      {
        id: "1",
        factType: "invoice",
        entityName: "Acme",
        amountValue: 1000,
        amountCurrency: "USD",
        dateValue: daysAgo(30),
        dateType: "issued",
        status: "unpaid",
        recurrence: "one_time",
        sourceReference: "row 1",
        confidence: 0.9,
      },
    ]);
    const issues = detectUnpaidInvoiceAging(facts);
    expect(issues).toHaveLength(0);
  });

  it("should flag invoices older than 45 days", () => {
    const facts = f([
      {
        id: "1",
        factType: "invoice",
        entityName: "Acme",
        amountValue: 1000,
        amountCurrency: "USD",
        dateValue: daysAgo(60),
        dateType: "issued",
        status: "unpaid",
        recurrence: "one_time",
        sourceReference: "row 1",
        confidence: 0.9,
      },
    ]);
    const issues = detectUnpaidInvoiceAging(facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("unpaid_invoice_aging");
    expect(issues[0].impactMin).toBe(1000);
    expect(issues[0].entityName).toBe("Acme");
  });

  it("should not flag paid invoices", () => {
    const facts = f([
      {
        id: "1",
        factType: "invoice",
        entityName: "Acme",
        amountValue: 1000,
        amountCurrency: "USD",
        dateValue: daysAgo(60),
        dateType: "issued",
        status: "paid",
        recurrence: "one_time",
        sourceReference: "row 1",
        confidence: 0.9,
      },
    ]);
    const issues = detectUnpaidInvoiceAging(facts);
    expect(issues).toHaveLength(0);
  });

  it("should return null impact when invoice has no currency", () => {
    const facts = f([
      {
        id: "1",
        factType: "invoice",
        entityName: "Acme",
        amountValue: 1000,
        amountCurrency: null, // Missing currency
        dateValue: daysAgo(60),
        dateType: "issued",
        status: "unpaid",
        recurrence: "one_time",
        sourceReference: "row 1",
        confidence: 0.9,
      },
    ]);
    const issues = detectUnpaidInvoiceAging(facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].impactMin).toBeNull();
    expect(issues[0].currency).toBeNull();
  });

  it("should return null impact when invoices have mixed currencies", () => {
    const facts = f([
      {
        id: "1",
        factType: "invoice",
        entityName: "Acme",
        amountValue: 1000,
        amountCurrency: "USD",
        dateValue: daysAgo(60),
        dateType: "issued",
        status: "unpaid",
        recurrence: "one_time",
        sourceReference: "row 1",
        confidence: 0.9,
      },
      {
        id: "2",
        factType: "invoice",
        entityName: "Acme",
        amountValue: 500,
        amountCurrency: "EUR", // Different currency
        dateValue: daysAgo(60),
        dateType: "issued",
        status: "unpaid",
        recurrence: "one_time",
        sourceReference: "row 2",
        confidence: 0.9,
      },
    ]);
    const issues = detectUnpaidInvoiceAging(facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].impactMin).toBeNull();
  });
});

describe("detectRecurringPaymentGap", () => {
  it("should return empty array when fewer than 3 payments", () => {
    const facts = f([
      {
        id: "1",
        factType: "payment",
        entityName: "Client A",
        amountValue: 500,
        amountCurrency: "USD",
        dateValue: monthDate(2024, 1),
        dateType: "paid",
        status: "paid",
        recurrence: "monthly",
        sourceReference: "row 1",
        confidence: 0.9,
      },
      {
        id: "2",
        factType: "payment",
        entityName: "Client A",
        amountValue: 500,
        amountCurrency: "USD",
        dateValue: monthDate(2024, 2),
        dateType: "paid",
        status: "paid",
        recurrence: "monthly",
        sourceReference: "row 2",
        confidence: 0.9,
      },
    ]);
    const issues = detectRecurringPaymentGap(facts);
    expect(issues).toHaveLength(0);
  });

  it("should detect gap in monthly payments", () => {
    const facts = f([
      {
        id: "1",
        factType: "payment",
        entityName: "Client A",
        amountValue: 500,
        amountCurrency: "USD",
        dateValue: monthDate(2024, 1),
        dateType: "paid",
        status: "paid",
        recurrence: "monthly",
        sourceReference: "row 1",
        confidence: 0.9,
      },
      {
        id: "2",
        factType: "payment",
        entityName: "Client A",
        amountValue: 500,
        amountCurrency: "USD",
        dateValue: monthDate(2024, 2),
        dateType: "paid",
        status: "paid",
        recurrence: "monthly",
        sourceReference: "row 2",
        confidence: 0.9,
      },
      {
        id: "3",
        factType: "payment",
        entityName: "Client A",
        amountValue: 500,
        amountCurrency: "USD",
        dateValue: monthDate(2024, 5), // Gap: skipped March and April
        dateType: "paid",
        status: "paid",
        recurrence: "monthly",
        sourceReference: "row 3",
        confidence: 0.9,
      },
    ]);
    const issues = detectRecurringPaymentGap(facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("recurring_payment_gap");
    expect(issues[0].entityName).toBe("Client A");
  });

  it("should not flag consistent monthly payments", () => {
    const facts = f([
      {
        id: "1",
        factType: "payment",
        entityName: "Client A",
        amountValue: 500,
        amountCurrency: "USD",
        dateValue: monthDate(2024, 1),
        dateType: "paid",
        status: "paid",
        recurrence: "monthly",
        sourceReference: "row 1",
        confidence: 0.9,
      },
      {
        id: "2",
        factType: "payment",
        entityName: "Client A",
        amountValue: 500,
        amountCurrency: "USD",
        dateValue: monthDate(2024, 2),
        dateType: "paid",
        status: "paid",
        recurrence: "monthly",
        sourceReference: "row 2",
        confidence: 0.9,
      },
      {
        id: "3",
        factType: "payment",
        entityName: "Client A",
        amountValue: 500,
        amountCurrency: "USD",
        dateValue: monthDate(2024, 3),
        dateType: "paid",
        status: "paid",
        recurrence: "monthly",
        sourceReference: "row 3",
        confidence: 0.9,
      },
    ]);
    const issues = detectRecurringPaymentGap(facts);
    expect(issues).toHaveLength(0);
  });
});

describe("detectAmountDrift", () => {
  it("should return empty array when fewer than 4 payments", () => {
    const facts = f(Array.from({ length: 3 }, (_, i) => ({
      id: String(i + 1),
      factType: "payment",
      entityName: "Client A",
      amountValue: 500,
      amountCurrency: "USD",
      dateValue: monthDate(2024, i + 1),
      dateType: "paid",
      status: "paid",
      recurrence: "monthly",
      sourceReference: `row ${i + 1}`,
      confidence: 0.9,
    })));
    const issues = detectAmountDrift(facts);
    expect(issues).toHaveLength(0);
  });

  it("should detect amount drift when recent payments are 20%+ lower", () => {
    const facts = f([
      // Stable payments
      ...Array.from({ length: 4 }, (_, i) => ({
        id: String(i + 1),
        factType: "payment",
        entityName: "Client A",
        amountValue: 1000,
        amountCurrency: "USD",
        dateValue: monthDate(2024, i + 1),
        dateType: "paid",
        status: "paid",
        recurrence: "monthly",
        sourceReference: `row ${i + 1}`,
        confidence: 0.9,
      })),
      // Drifted payments (30% lower)
      {
        id: "5",
        factType: "payment",
        entityName: "Client A",
        amountValue: 700,
        amountCurrency: "USD",
        dateValue: monthDate(2024, 5),
        dateType: "paid",
        status: "paid",
        recurrence: "monthly",
        sourceReference: "row 5",
        confidence: 0.9,
      },
      {
        id: "6",
        factType: "payment",
        entityName: "Client A",
        amountValue: 700,
        amountCurrency: "USD",
        dateValue: monthDate(2024, 6),
        dateType: "paid",
        status: "paid",
        recurrence: "monthly",
        sourceReference: "row 6",
        confidence: 0.9,
      },
    ]);
    const issues = detectAmountDrift(facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("amount_drift");
    expect(issues[0].entityName).toBe("Client A");
  });

  it("should not flag when amounts are stable", () => {
    const facts = f(Array.from({ length: 6 }, (_, i) => ({
      id: String(i + 1),
      factType: "payment",
      entityName: "Client A",
      amountValue: 1000,
      amountCurrency: "USD",
      dateValue: monthDate(2024, i + 1),
      dateType: "paid",
      status: "paid",
      recurrence: "monthly",
      sourceReference: `row ${i + 1}`,
      confidence: 0.9,
    })));
    const issues = detectAmountDrift(facts);
    expect(issues).toHaveLength(0);
  });
});

describe("detectDuplicateCharges", () => {
  it("should return empty array when no duplicates", () => {
    const facts = f([
      {
        id: "1",
        factType: "payment",
        entityName: "Client A",
        amountValue: 100,
        amountCurrency: "USD",
        dateValue: "2024-01-15",
        dateType: "paid",
        status: "paid",
        recurrence: "one_time",
        sourceReference: "row 1",
        confidence: 0.9,
      },
      {
        id: "2",
        factType: "payment",
        entityName: "Client A",
        amountValue: 200,
        amountCurrency: "USD",
        dateValue: "2024-01-15",
        dateType: "paid",
        status: "paid",
        recurrence: "one_time",
        sourceReference: "row 2",
        confidence: 0.9,
      },
    ]);
    const issues = detectDuplicateCharges(facts);
    expect(issues).toHaveLength(0);
  });

  it("should detect duplicate charges on same day with same amount", () => {
    const facts = f([
      {
        id: "1",
        factType: "payment",
        entityName: "Client A",
        amountValue: 100,
        amountCurrency: "USD",
        dateValue: "2024-01-15",
        dateType: "paid",
        status: "paid",
        recurrence: "one_time",
        sourceReference: "row 1",
        confidence: 0.9,
      },
      {
        id: "2",
        factType: "payment",
        entityName: "Client A",
        amountValue: 100,
        amountCurrency: "USD",
        dateValue: "2024-01-15",
        dateType: "paid",
        status: "paid",
        recurrence: "one_time",
        sourceReference: "row 2",
        confidence: 0.9,
      },
    ]);
    const issues = detectDuplicateCharges(facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("duplicate_charge");
    expect(issues[0].severity).toBe("low");
    expect(issues[0].impactMin).toBe(100); // One duplicate
  });

  it("should not flag different entities on same day with same amount", () => {
    const facts = f([
      {
        id: "1",
        factType: "payment",
        entityName: "Client A",
        amountValue: 100,
        amountCurrency: "USD",
        dateValue: "2024-01-15",
        dateType: "paid",
        status: "paid",
        recurrence: "one_time",
        sourceReference: "row 1",
        confidence: 0.9,
      },
      {
        id: "2",
        factType: "payment",
        entityName: "Client B",
        amountValue: 100,
        amountCurrency: "USD",
        dateValue: "2024-01-15",
        dateType: "paid",
        status: "paid",
        recurrence: "one_time",
        sourceReference: "row 2",
        confidence: 0.9,
      },
    ]);
    const issues = detectDuplicateCharges(facts);
    expect(issues).toHaveLength(0);
  });
});
