import { describe, it, expect } from "vitest";
import { detectNewRecurringCharge } from "../newRecurringCharge";
import { detectPriceCreep } from "../priceCreep";
import { detectBankDuplicateCharges } from "../duplicateCharge";
import { detectUnusualSpike } from "../unusualSpike";
import { classifyMonthlyByEntity } from "../../../recurrence";
import { FactRecord } from "../../../types";

// Helper to create a date string N days ago from a base date
function daysFrom(baseDate: string, days: number): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Helper to create a fact with defaults
function createFact(overrides: Partial<FactRecord> = {}): FactRecord {
  return {
    id: "fact1",
    factType: "payment",
    entityName: "Test Merchant",
    entityRaw: "TEST MERCHANT",
    entityCanonical: "TEST MERCHANT",
    amountValue: 100,
    amountCurrency: "USD",
    dateValue: "2024-01-15",
    dateType: "paid",
    status: "paid",
    recurrence: "one_time",
    sourceReference: "row 1",
    confidence: 0.9,
    direction: "outflow",
    clearingStatus: "cleared",
    ...overrides,
  };
}

describe("detectNewRecurringCharge", () => {
  const baseDate = "2024-01-15";
  const datasetEndDate = "2024-03-15"; // 60 days after base

  it("should detect a new recurring charge started within 60 days", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 9.99 }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 9.99 }),
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 9.99 }),
    ];

    const derivedRecurrence = classifyMonthlyByEntity(facts);
    const issues = detectNewRecurringCharge(facts, { derivedRecurrence, datasetEndDate });

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("new_recurring_charge");
    expect(issues[0].title).toContain("Test Merchant");
    expect(issues[0].evidenceFactIds.length).toBe(3);
  });

  it("should not detect recurring charges that started more than 60 days ago", () => {
    const oldBaseDate = "2023-11-01"; // Well before dataset end
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: oldBaseDate, amountValue: 9.99 }),
      createFact({ id: "2", dateValue: daysFrom(oldBaseDate, 30), amountValue: 9.99 }),
      createFact({ id: "3", dateValue: daysFrom(oldBaseDate, 60), amountValue: 9.99 }),
    ];

    const derivedRecurrence = classifyMonthlyByEntity(facts);
    const issues = detectNewRecurringCharge(facts, { derivedRecurrence, datasetEndDate });

    expect(issues.length).toBe(0);
  });

  it("should classify high severity for annualized > $500", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 50 }), // $600/year
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 50 }),
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 50 }),
    ];

    const derivedRecurrence = classifyMonthlyByEntity(facts);
    const issues = detectNewRecurringCharge(facts, { derivedRecurrence, datasetEndDate });

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe("high");
  });

  it("should exclude non-merchant transactions (transfers)", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100, entityCanonical: "ZELLE PAYMENT" }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100, entityCanonical: "ZELLE PAYMENT" }),
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 100, entityCanonical: "ZELLE PAYMENT" }),
    ];

    const derivedRecurrence = classifyMonthlyByEntity(facts);
    const issues = detectNewRecurringCharge(facts, { derivedRecurrence, datasetEndDate });

    expect(issues.length).toBe(0);
  });
});

describe("detectPriceCreep", () => {
  const baseDate = "2024-01-15";

  it("should detect price increase >= 15% from baseline", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 100 }),
      createFact({ id: "4", dateValue: daysFrom(baseDate, 90), amountValue: 120 }), // 20% increase
    ];

    const derivedRecurrence = classifyMonthlyByEntity(facts);
    const issues = detectPriceCreep(facts, { derivedRecurrence });

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("price_creep");
    expect(issues[0].title).toContain("increased");
    expect(issues[0].rationale.some(r => r.includes("20%"))).toBe(true);
  });

  it("should not detect if increase is < 15%", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 100 }),
      createFact({ id: "4", dateValue: daysFrom(baseDate, 90), amountValue: 110 }), // Only 10% increase
    ];

    const derivedRecurrence = classifyMonthlyByEntity(facts);
    const issues = detectPriceCreep(facts, { derivedRecurrence });

    expect(issues.length).toBe(0);
  });

  it("should require stable baseline (within 10%)", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 80 }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 120 }), // Unstable baseline
      createFact({ id: "4", dateValue: daysFrom(baseDate, 90), amountValue: 150 }),
    ];

    const derivedRecurrence = classifyMonthlyByEntity(facts);
    const issues = detectPriceCreep(facts, { derivedRecurrence });

    expect(issues.length).toBe(0);
  });

  it("should exclude non-merchant transactions", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100, entityCanonical: "VENMO PAYMENT" }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100, entityCanonical: "VENMO PAYMENT" }),
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 100, entityCanonical: "VENMO PAYMENT" }),
      createFact({ id: "4", dateValue: daysFrom(baseDate, 90), amountValue: 150, entityCanonical: "VENMO PAYMENT" }),
    ];

    const derivedRecurrence = classifyMonthlyByEntity(facts);
    const issues = detectPriceCreep(facts, { derivedRecurrence });

    expect(issues.length).toBe(0);
  });
});

describe("detectBankDuplicateCharges", () => {
  it("should detect duplicate charges on same day", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: "2024-01-15", amountValue: 50 }),
      createFact({ id: "2", dateValue: "2024-01-15", amountValue: 50 }), // Same day, same amount
    ];

    const issues = detectBankDuplicateCharges(facts);

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("duplicate_charge");
    expect(issues[0].evidenceFactIds.length).toBe(2);
  });

  it("should not flag different amounts on same day", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: "2024-01-15", amountValue: 50 }),
      createFact({ id: "2", dateValue: "2024-01-15", amountValue: 75 }), // Different amount
    ];

    const issues = detectBankDuplicateCharges(facts);

    expect(issues.length).toBe(0);
  });

  it("should not flag same amount on different days", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: "2024-01-15", amountValue: 50 }),
      createFact({ id: "2", dateValue: "2024-01-16", amountValue: 50 }), // Different day
    ];

    const issues = detectBankDuplicateCharges(facts);

    expect(issues.length).toBe(0);
  });

  it("should detect duplicates even for transfer entities", () => {
    // Duplicates are a legitimate concern for all transaction types
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: "2024-01-15", amountValue: 100, entityCanonical: "ZELLE PAYMENT" }),
      createFact({ id: "2", dateValue: "2024-01-15", amountValue: 100, entityCanonical: "ZELLE PAYMENT" }),
    ];

    const issues = detectBankDuplicateCharges(facts);

    expect(issues.length).toBe(1);
  });

  it("should only consider outflow + cleared", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: "2024-01-15", amountValue: 50, direction: "inflow" }),
      createFact({ id: "2", dateValue: "2024-01-15", amountValue: 50, direction: "inflow" }),
    ];

    const issues = detectBankDuplicateCharges(facts);

    expect(issues.length).toBe(0);
  });
});

describe("detectUnusualSpike", () => {
  const baseDate = "2024-01-01";

  it("should detect spike > 2.5x median with sufficient history", () => {
    const facts: FactRecord[] = [
      // 6 historical transactions around $20 (need 6 in history)
      ...Array.from({ length: 6 }, (_, i) =>
        createFact({
          id: `${i + 1}`,
          dateValue: daysFrom(baseDate, i * 7),
          amountValue: 20,
        })
      ),
      // Spike: $60 (3x median) - this is the 7th transaction
      createFact({
        id: "7",
        dateValue: daysFrom(baseDate, 50),
        amountValue: 60,
      }),
    ];

    const issues = detectUnusualSpike(facts);

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("unusual_spike");
    expect(issues[0].title).toContain("Unusual charge amount");
    expect(issues[0].rationale.some(r => r.includes("3.0x"))).toBe(true);
  });

  it("should not flag if spike is < 2.5x median", () => {
    const facts: FactRecord[] = [
      // 6 historical
      ...Array.from({ length: 6 }, (_, i) =>
        createFact({
          id: `${i + 1}`,
          dateValue: daysFrom(baseDate, i * 7),
          amountValue: 20,
        })
      ),
      // 7th transaction is only 2x, not 2.5x
      createFact({
        id: "7",
        dateValue: daysFrom(baseDate, 50),
        amountValue: 40, // Only 2x median
      }),
    ];

    const issues = detectUnusualSpike(facts);

    expect(issues.length).toBe(0);
  });

  it("should require >= 6 historical transactions", () => {
    const facts: FactRecord[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        createFact({
          id: `${i + 1}`,
          dateValue: daysFrom(baseDate, i * 7),
          amountValue: 20,
        })
      ),
      createFact({
        id: "6",
        dateValue: daysFrom(baseDate, 42),
        amountValue: 100, // Would be a spike if we had enough history
      }),
    ];

    const issues = detectUnusualSpike(facts);

    expect(issues.length).toBe(0);
  });

  it("should exclude non-merchant transactions", () => {
    const facts: FactRecord[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        createFact({
          id: `${i + 1}`,
          dateValue: daysFrom(baseDate, i * 7),
          amountValue: 100,
          entityCanonical: "ACH TRANSFER",
        })
      ),
      createFact({
        id: "7",
        dateValue: daysFrom(baseDate, 49),
        amountValue: 500,
        entityCanonical: "ACH TRANSFER",
      }),
    ];

    const issues = detectUnusualSpike(facts);

    expect(issues.length).toBe(0);
  });
});

describe("exclusion list prevents false positives", () => {
  const baseDate = "2024-01-15";

  const nonMerchantPatterns = [
    "PAYMENT",
    "TRANSFER",
    "ZELLE JOHN DOE",
    "VENMO PAYMENT",
    "CASH APP",
    "ACH WITHDRAWAL",
    "WIRE TRANSFER",
    "AUTOPAY",
    "CARD PAYMENT",
    "ONLINE PAYMENT",
  ];

  it.each(nonMerchantPatterns)("should exclude '%s' from new recurring charge detection", (pattern) => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100, entityCanonical: pattern }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100, entityCanonical: pattern }),
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 100, entityCanonical: pattern }),
    ];

    const derivedRecurrence = classifyMonthlyByEntity(facts);
    const issues = detectNewRecurringCharge(facts, {
      derivedRecurrence,
      datasetEndDate: daysFrom(baseDate, 60),
    });

    expect(issues.length).toBe(0);
  });

  it.each(nonMerchantPatterns)("should exclude '%s' from spike detection", (pattern) => {
    const facts: FactRecord[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        createFact({
          id: `${i + 1}`,
          dateValue: daysFrom(baseDate, i * 7),
          amountValue: 50,
          entityCanonical: pattern,
        })
      ),
      createFact({
        id: "7",
        dateValue: daysFrom(baseDate, 49),
        amountValue: 200,
        entityCanonical: pattern,
      }),
    ];

    const issues = detectUnusualSpike(facts);

    expect(issues.length).toBe(0);
  });
});
