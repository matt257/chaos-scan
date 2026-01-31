import { describe, it, expect } from "vitest";
import {
  computeEvidenceStats,
  generateUnpaidInvoiceSummary,
  generatePaymentGapSummary,
  generateAmountDriftSummary,
  generateDuplicateSummary,
} from "../evidenceSummary";
import { FactRecord } from "../types";

function createFact(overrides: Partial<FactRecord> = {}): FactRecord {
  return {
    id: "fact1",
    factType: "payment",
    entityName: "Test Entity",
    amountValue: 100,
    amountCurrency: "USD",
    dateValue: "2024-03-15",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "row 1",
    confidence: 0.9,
    direction: "unknown",
    clearingStatus: "unknown",
    ...overrides,
  };
}

describe("computeEvidenceStats", () => {
  it("should return empty stats for empty array", () => {
    const stats = computeEvidenceStats([]);
    expect(stats.count).toBe(0);
    expect(stats.dateRange).toBeNull();
    expect(stats.medianAmount).toBeNull();
    expect(stats.currency).toBeNull();
    expect(stats.sourceReferences).toEqual([]);
  });

  it("should compute count correctly", () => {
    const facts = [
      createFact({ id: "1" }),
      createFact({ id: "2" }),
      createFact({ id: "3" }),
    ];
    const stats = computeEvidenceStats(facts);
    expect(stats.count).toBe(3);
  });

  it("should compute date range correctly", () => {
    const facts = [
      createFact({ id: "1", dateValue: "2024-01-15" }),
      createFact({ id: "2", dateValue: "2024-03-15" }),
      createFact({ id: "3", dateValue: "2024-02-15" }),
    ];
    const stats = computeEvidenceStats(facts);
    expect(stats.dateRange).toEqual({ start: "2024-01-15", end: "2024-03-15" });
  });

  it("should handle facts without dates", () => {
    const facts = [
      createFact({ id: "1", dateValue: null }),
      createFact({ id: "2", dateValue: "2024-02-15" }),
    ];
    const stats = computeEvidenceStats(facts);
    expect(stats.dateRange).toEqual({ start: "2024-02-15", end: "2024-02-15" });
  });

  it("should compute median amount correctly", () => {
    const facts = [
      createFact({ id: "1", amountValue: 100 }),
      createFact({ id: "2", amountValue: 200 }),
      createFact({ id: "3", amountValue: 300 }),
    ];
    const stats = computeEvidenceStats(facts);
    expect(stats.medianAmount).toBe(200);
  });

  it("should compute median for even number of amounts", () => {
    const facts = [
      createFact({ id: "1", amountValue: 100 }),
      createFact({ id: "2", amountValue: 200 }),
      createFact({ id: "3", amountValue: 300 }),
      createFact({ id: "4", amountValue: 400 }),
    ];
    const stats = computeEvidenceStats(facts);
    expect(stats.medianAmount).toBe(250); // (200 + 300) / 2
  });

  it("should return currency when all facts have same currency", () => {
    const facts = [
      createFact({ id: "1", amountCurrency: "USD" }),
      createFact({ id: "2", amountCurrency: "USD" }),
    ];
    const stats = computeEvidenceStats(facts);
    expect(stats.currency).toBe("USD");
  });

  it("should return null currency when currencies are mixed", () => {
    const facts = [
      createFact({ id: "1", amountCurrency: "USD" }),
      createFact({ id: "2", amountCurrency: "EUR" }),
    ];
    const stats = computeEvidenceStats(facts);
    expect(stats.currency).toBeNull();
  });

  it("should collect source references", () => {
    const facts = [
      createFact({ id: "1", sourceReference: "row 1" }),
      createFact({ id: "2", sourceReference: "row 2" }),
      createFact({ id: "3", sourceReference: "row 3" }),
    ];
    const stats = computeEvidenceStats(facts);
    expect(stats.sourceReferences).toEqual(["row 1", "row 2", "row 3"]);
  });
});

describe("generateUnpaidInvoiceSummary", () => {
  it("should generate summary with count and oldest days", () => {
    const facts = [
      createFact({ id: "1", factType: "invoice", dateValue: "2024-01-15" }),
    ];
    const result = generateUnpaidInvoiceSummary(facts, 60);
    expect(result.summary).toContain("1 unpaid invoice");
    expect(result.summary).toContain("oldest 60 days");
  });

  it("should include date range in summary", () => {
    const facts = [
      createFact({ id: "1", factType: "invoice", dateValue: "2024-01-15" }),
      createFact({ id: "2", factType: "invoice", dateValue: "2024-03-15" }),
    ];
    const result = generateUnpaidInvoiceSummary(facts, 60);
    expect(result.summary).toContain("Jan–Mar");
  });

  it("should include median amount in summary", () => {
    const facts = [
      createFact({ id: "1", factType: "invoice", amountValue: 1000, amountCurrency: "USD" }),
      createFact({ id: "2", factType: "invoice", amountValue: 2000, amountCurrency: "USD" }),
    ];
    const result = generateUnpaidInvoiceSummary(facts, 60);
    expect(result.summary).toContain("median $1,500");
  });

  it("should return stats with source references", () => {
    const facts = [
      createFact({ id: "1", sourceReference: "invoice.csv:5" }),
    ];
    const result = generateUnpaidInvoiceSummary(facts, 60);
    expect(result.stats.sourceReferences).toContain("invoice.csv:5");
  });
});

describe("generatePaymentGapSummary", () => {
  it("should generate summary with gap days", () => {
    const facts = [
      createFact({ id: "1", dateValue: "2024-01-15" }),
      createFact({ id: "2", dateValue: "2024-02-15" }),
    ];
    const result = generatePaymentGapSummary(facts, 62, "2024-02-15");
    expect(result.summary).toContain("2 payments");
    expect(result.summary).toContain("62-day gap");
  });

  it("should include date range in summary", () => {
    const facts = [
      createFact({ id: "1", dateValue: "2024-01-15" }),
      createFact({ id: "2", dateValue: "2024-05-15" }),
    ];
    const result = generatePaymentGapSummary(facts, 62, "2024-05-15");
    expect(result.summary).toContain("Jan–May");
  });
});

describe("generateAmountDriftSummary", () => {
  it("should generate summary with drift percentage", () => {
    const facts = [
      createFact({ id: "1", amountValue: 1000, amountCurrency: "USD" }),
      createFact({ id: "2", amountValue: 700, amountCurrency: "USD" }),
    ];
    const result = generateAmountDriftSummary(facts, 1000, 700, 30);
    expect(result.summary).toContain("2 payments");
    expect(result.summary).toContain("dropped 30%");
    expect(result.summary).toContain("$1,000");
    expect(result.summary).toContain("$700");
  });

  it("should include date range in summary", () => {
    const facts = [
      createFact({ id: "1", dateValue: "2024-01-15" }),
      createFact({ id: "2", dateValue: "2024-06-15" }),
    ];
    const result = generateAmountDriftSummary(facts, 1000, 700, 30);
    expect(result.summary).toContain("Jan–Jun");
  });
});

describe("generateDuplicateSummary", () => {
  it("should generate summary with count and date", () => {
    const facts = [
      createFact({ id: "1", dateValue: "2024-03-15", amountValue: 100 }),
      createFact({ id: "2", dateValue: "2024-03-15", amountValue: 100 }),
    ];
    const result = generateDuplicateSummary(facts, "2024-03-15");
    expect(result.summary).toContain("2 identical charges");
    expect(result.summary).toContain("Mar 2024");
    expect(result.summary).toContain("$100 each");
  });

  it("should handle single fact correctly", () => {
    const facts = [
      createFact({ id: "1", dateValue: "2024-03-15", amountValue: 500 }),
    ];
    const result = generateDuplicateSummary(facts, "2024-03-15");
    expect(result.summary).toContain("1 identical charge");
    expect(result.summary).toContain("$500 each");
  });
});

describe("evidence stats integration", () => {
  it("should provide complete stats for unpaid invoice summary", () => {
    const facts = [
      createFact({
        id: "1",
        factType: "invoice",
        amountValue: 1000,
        amountCurrency: "USD",
        dateValue: "2024-01-15",
        sourceReference: "invoices.csv:2",
      }),
      createFact({
        id: "2",
        factType: "invoice",
        amountValue: 2000,
        amountCurrency: "USD",
        dateValue: "2024-02-15",
        sourceReference: "invoices.csv:3",
      }),
    ];

    const result = generateUnpaidInvoiceSummary(facts, 45);

    expect(result.stats.count).toBe(2);
    expect(result.stats.dateRange).toEqual({ start: "2024-01-15", end: "2024-02-15" });
    expect(result.stats.medianAmount).toBe(1500);
    expect(result.stats.currency).toBe("USD");
    expect(result.stats.sourceReferences).toEqual(["invoices.csv:2", "invoices.csv:3"]);
  });

  it("should handle null amounts gracefully", () => {
    const facts = [
      createFact({ id: "1", amountValue: null }),
      createFact({ id: "2", amountValue: null }),
    ];

    const result = generatePaymentGapSummary(facts, 45, "2024-01-15");

    expect(result.stats.medianAmount).toBeNull();
  });
});
