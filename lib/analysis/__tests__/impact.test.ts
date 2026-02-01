import { describe, it, expect } from "vitest";
import {
  calculateUnpaidInvoiceImpact,
  calculatePaymentGapImpact,
  calculateDriftImpact,
  calculateDuplicateImpact,
  formatImpactRationale,
} from "../impact";
import { FactRecord } from "../types";

function createFact(overrides: Partial<FactRecord> = {}): FactRecord {
  return {
    id: "fact1",
    factType: "invoice",
    entityName: "Test Entity",
    entityRaw: "Test Entity",
    entityCanonical: "TEST ENTITY",
    amountValue: 1000,
    amountCurrency: "USD",
    dateValue: "2024-01-15",
    dateType: "issued",
    status: "unpaid",
    recurrence: "one_time",
    sourceReference: "row 1",
    confidence: 0.9,
    direction: "unknown",
    clearingStatus: "unknown",
    ...overrides,
  };
}

describe("calculateUnpaidInvoiceImpact", () => {
  it("should return impact when all invoices have amount and currency", () => {
    const invoices: FactRecord[] = [
      createFact({ amountValue: 1000, amountCurrency: "USD" }),
      createFact({ id: "fact2", amountValue: 500, amountCurrency: "USD" }),
    ];

    const result = calculateUnpaidInvoiceImpact(invoices);

    expect(result.impactMin).toBe(1500);
    expect(result.impactMax).toBe(1500);
    expect(result.currency).toBe("USD");
    expect(result.reason).toBeNull();
  });

  it("should return null impact when some invoices missing amount", () => {
    const invoices: FactRecord[] = [
      createFact({ amountValue: 1000, amountCurrency: "USD" }),
      createFact({ id: "fact2", amountValue: null, amountCurrency: "USD" }),
    ];

    const result = calculateUnpaidInvoiceImpact(invoices);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("missing amount");
  });

  it("should return null impact when some invoices missing currency", () => {
    const invoices: FactRecord[] = [
      createFact({ amountValue: 1000, amountCurrency: "USD" }),
      createFact({ id: "fact2", amountValue: 500, amountCurrency: null }),
    ];

    const result = calculateUnpaidInvoiceImpact(invoices);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("missing explicit currency");
  });

  it("should return null impact when currencies are mixed", () => {
    const invoices: FactRecord[] = [
      createFact({ amountValue: 1000, amountCurrency: "USD" }),
      createFact({ id: "fact2", amountValue: 500, amountCurrency: "EUR" }),
    ];

    const result = calculateUnpaidInvoiceImpact(invoices);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("Mixed currencies");
  });

  it("should return null impact for empty array", () => {
    const result = calculateUnpaidInvoiceImpact([]);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("No aged invoices");
  });
});

describe("calculatePaymentGapImpact", () => {
  it("should return impact when amounts are stable and all have currency", () => {
    const payments: FactRecord[] = [
      createFact({ factType: "payment", recurrence: "monthly", amountValue: 100, amountCurrency: "USD" }),
      createFact({ id: "f2", factType: "payment", recurrence: "monthly", amountValue: 100, amountCurrency: "USD" }),
      createFact({ id: "f3", factType: "payment", recurrence: "monthly", amountValue: 100, amountCurrency: "USD" }),
    ];

    const result = calculatePaymentGapImpact(payments, 2);

    expect(result.impactMin).toBe(200); // 100 * 2 months
    expect(result.currency).toBe("USD");
    expect(result.reason).toBeNull();
  });

  it("should return null impact when amounts vary more than 10%", () => {
    const payments: FactRecord[] = [
      createFact({ factType: "payment", recurrence: "monthly", amountValue: 100, amountCurrency: "USD" }),
      createFact({ id: "f2", factType: "payment", recurrence: "monthly", amountValue: 150, amountCurrency: "USD" }), // 50% variance
      createFact({ id: "f3", factType: "payment", recurrence: "monthly", amountValue: 100, amountCurrency: "USD" }),
    ];

    const result = calculatePaymentGapImpact(payments, 2);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("not stable");
  });

  it("should return null impact when recurrence is not monthly", () => {
    const payments: FactRecord[] = [
      createFact({ factType: "payment", recurrence: "monthly", amountValue: 100, amountCurrency: "USD" }),
      createFact({ id: "f2", factType: "payment", recurrence: "quarterly", amountValue: 100, amountCurrency: "USD" }),
    ];

    const result = calculatePaymentGapImpact(payments, 2);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("explicit monthly recurrence");
  });

  it("should return null impact when currency is missing", () => {
    const payments: FactRecord[] = [
      createFact({ factType: "payment", recurrence: "monthly", amountValue: 100, amountCurrency: "USD" }),
      createFact({ id: "f2", factType: "payment", recurrence: "monthly", amountValue: 100, amountCurrency: null }),
    ];

    const result = calculatePaymentGapImpact(payments, 2);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("missing explicit currency");
  });

  it("should return null impact when fewer than 2 payments", () => {
    const payments: FactRecord[] = [
      createFact({ factType: "payment", recurrence: "monthly", amountValue: 100, amountCurrency: "USD" }),
    ];

    const result = calculatePaymentGapImpact(payments, 2);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("Insufficient payment history");
  });

  it("should return null impact when months missed is 0", () => {
    const payments: FactRecord[] = [
      createFact({ factType: "payment", recurrence: "monthly", amountValue: 100, amountCurrency: "USD" }),
      createFact({ id: "f2", factType: "payment", recurrence: "monthly", amountValue: 100, amountCurrency: "USD" }),
    ];

    const result = calculatePaymentGapImpact(payments, 0);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("No months missed");
  });
});

describe("calculateDriftImpact", () => {
  it("should return annual impact when all conditions met", () => {
    const payments: FactRecord[] = Array.from({ length: 6 }, (_, i) =>
      createFact({
        id: `f${i}`,
        factType: "payment",
        recurrence: "monthly",
        amountValue: 100,
        amountCurrency: "USD",
      })
    );

    const result = calculateDriftImpact(payments, 100, 70); // 30% drift

    expect(result.impactMin).toBe(360); // (100-70) * 12
    expect(result.currency).toBe("USD");
    expect(result.reason).toBeNull();
  });

  it("should return null impact when currency is missing", () => {
    const payments: FactRecord[] = Array.from({ length: 6 }, (_, i) =>
      createFact({
        id: `f${i}`,
        factType: "payment",
        recurrence: "monthly",
        amountValue: 100,
        amountCurrency: i === 0 ? null : "USD", // First one missing currency
      })
    );

    const result = calculateDriftImpact(payments, 100, 70);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("missing explicit currency");
  });

  it("should return null impact when recurrence is not monthly", () => {
    const payments: FactRecord[] = Array.from({ length: 6 }, (_, i) =>
      createFact({
        id: `f${i}`,
        factType: "payment",
        recurrence: i === 0 ? "quarterly" : "monthly",
        amountValue: 100,
        amountCurrency: "USD",
      })
    );

    const result = calculateDriftImpact(payments, 100, 70);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("explicit monthly recurrence");
  });

  it("should return null impact when fewer than 4 payments", () => {
    const payments: FactRecord[] = Array.from({ length: 3 }, (_, i) =>
      createFact({
        id: `f${i}`,
        factType: "payment",
        recurrence: "monthly",
        amountValue: 100,
        amountCurrency: "USD",
      })
    );

    const result = calculateDriftImpact(payments, 100, 70);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("Insufficient payment history");
  });
});

describe("calculateDuplicateImpact", () => {
  it("should return impact when all have amount and currency", () => {
    const payments: FactRecord[] = [
      createFact({ factType: "payment", amountValue: 100, amountCurrency: "USD" }),
      createFact({ id: "f2", factType: "payment", amountValue: 100, amountCurrency: "USD" }),
      createFact({ id: "f3", factType: "payment", amountValue: 100, amountCurrency: "USD" }),
    ];

    const result = calculateDuplicateImpact(payments);

    expect(result.impactMin).toBe(200); // 2 duplicates * 100
    expect(result.currency).toBe("USD");
    expect(result.reason).toBeNull();
  });

  it("should return null impact when currency is missing", () => {
    const payments: FactRecord[] = [
      createFact({ factType: "payment", amountValue: 100, amountCurrency: "USD" }),
      createFact({ id: "f2", factType: "payment", amountValue: 100, amountCurrency: null }),
    ];

    const result = calculateDuplicateImpact(payments);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("missing explicit currency");
  });

  it("should return null impact when currencies are mixed", () => {
    const payments: FactRecord[] = [
      createFact({ factType: "payment", amountValue: 100, amountCurrency: "USD" }),
      createFact({ id: "f2", factType: "payment", amountValue: 100, amountCurrency: "EUR" }),
    ];

    const result = calculateDuplicateImpact(payments);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("Mixed currencies");
  });

  it("should return null impact when fewer than 2 payments", () => {
    const payments: FactRecord[] = [
      createFact({ factType: "payment", amountValue: 100, amountCurrency: "USD" }),
    ];

    const result = calculateDuplicateImpact(payments);

    expect(result.impactMin).toBeNull();
    expect(result.reason).toContain("Not enough duplicates");
  });
});

describe("formatImpactRationale", () => {
  it("should format impact when present", () => {
    const result = formatImpactRationale({
      impactMin: 1500,
      impactMax: 1500,
      currency: "USD",
      reason: null,
    });

    expect(result).toContain("$1,500");
    expect(result).toContain("Estimated impact");
  });

  it("should format reason when impact is null", () => {
    const result = formatImpactRationale({
      impactMin: null,
      impactMax: null,
      currency: null,
      reason: "Missing currency",
    });

    expect(result).toContain("unknown");
    expect(result).toContain("missing currency");
  });

  it("should show generic message when no reason provided", () => {
    const result = formatImpactRationale({
      impactMin: null,
      impactMax: null,
      currency: null,
      reason: null,
    });

    expect(result).toContain("unknown");
    expect(result).toContain("insufficient evidence");
  });
});
