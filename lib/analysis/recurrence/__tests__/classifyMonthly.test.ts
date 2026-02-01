import { describe, it, expect } from "vitest";
import { classifyMonthlyByEntity, isEntityMonthly } from "../classifyMonthly";
import { FactRecord } from "../../types";

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
    entityName: "Test Entity",
    entityRaw: "Test Entity",
    entityCanonical: "TEST ENTITY",
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

describe("classifyMonthlyByEntity", () => {
  describe("true monthly classification", () => {
    it("should classify entity as monthly with 3 charges ~30 days apart", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
        createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
        createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 100 }),
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(true);
      expect(classification?.evidenceCount).toBe(3);
      expect(classification?.confidence).toBeGreaterThan(0.5);
    });

    it("should classify entity as monthly with 5 charges ~30 days apart", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = Array.from({ length: 5 }, (_, i) =>
        createFact({
          id: `${i + 1}`,
          dateValue: daysFrom(baseDate, i * 30),
          amountValue: 99.99,
        })
      );

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(true);
      expect(classification?.evidenceCount).toBe(5);
      expect(classification?.confidence).toBeGreaterThan(0.7);
    });

    it("should allow slight variations in interval (28-33 days)", () => {
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: "2024-01-15", amountValue: 100 }),
        createFact({ id: "2", dateValue: "2024-02-13", amountValue: 100 }), // 29 days
        createFact({ id: "3", dateValue: "2024-03-17", amountValue: 100 }), // 33 days
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(true);
    });

    it("should allow slight variations in amount (within 10%)", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
        createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 105 }), // +5%
        createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 95 }),  // -5%
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(true);
    });
  });

  describe("not monthly - irregular timing", () => {
    it("should not classify as monthly with irregular intervals", () => {
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: "2024-01-15", amountValue: 100 }),
        createFact({ id: "2", dateValue: "2024-02-15", amountValue: 100 }), // 31 days
        createFact({ id: "3", dateValue: "2024-04-15", amountValue: 100 }), // 60 days - too long
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(false);
    });

    it("should not classify as monthly with weekly intervals", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = Array.from({ length: 5 }, (_, i) =>
        createFact({
          id: `${i + 1}`,
          dateValue: daysFrom(baseDate, i * 7), // Weekly
          amountValue: 100,
        })
      );

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(false);
    });

    it("should not classify as monthly with intervals outside 28-33 days", () => {
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: "2024-01-15", amountValue: 100 }),
        createFact({ id: "2", dateValue: "2024-02-20", amountValue: 100 }), // 36 days - too long
        createFact({ id: "3", dateValue: "2024-03-25", amountValue: 100 }), // 34 days - too long
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(false);
    });
  });

  describe("not monthly - drifting amount", () => {
    it("should not classify as monthly when amounts drift >10%", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
        createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
        createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 120 }), // 20% higher
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(false);
    });

    it("should not classify as monthly when amounts are highly variable", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: baseDate, amountValue: 50 }),
        createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
        createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 150 }),
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(false);
    });
  });

  describe("filtering - reversed/pending entries", () => {
    it("should ignore pending entries in classification", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
        createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
        createFact({ id: "3", dateValue: daysFrom(baseDate, 45), amountValue: 100, clearingStatus: "pending" }), // Should be ignored
        createFact({ id: "4", dateValue: daysFrom(baseDate, 60), amountValue: 100 }),
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      // Should still classify as monthly because the pending entry is ignored
      expect(classification?.isMonthly).toBe(true);
      expect(classification?.evidenceCount).toBe(3); // Only 3 cleared entries
    });

    it("should ignore reversed entries in classification", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
        createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
        createFact({ id: "3", dateValue: daysFrom(baseDate, 35), amountValue: 100, clearingStatus: "reversed" }), // Should be ignored
        createFact({ id: "4", dateValue: daysFrom(baseDate, 60), amountValue: 100 }),
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(true);
      expect(classification?.evidenceCount).toBe(3);
    });

    it("should still work if enough cleared entries remain after filtering", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
        createFact({ id: "2", dateValue: daysFrom(baseDate, 15), amountValue: 100, clearingStatus: "pending" }),
        createFact({ id: "3", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
        createFact({ id: "4", dateValue: daysFrom(baseDate, 45), amountValue: 100, clearingStatus: "reversed" }),
        createFact({ id: "5", dateValue: daysFrom(baseDate, 60), amountValue: 100 }),
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(true);
      expect(classification?.evidenceCount).toBe(3);
    });
  });

  describe("filtering - direction", () => {
    it("should only consider outflow transactions", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
        createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100, direction: "inflow" }), // Should be ignored
        createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 100 }),
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      // Only 2 qualifying facts, not enough
      expect(classification?.isMonthly).toBe(false);
      expect(classification?.evidenceCount).toBe(2);
    });
  });

  describe("insufficient data", () => {
    it("should not classify with fewer than 3 occurrences", () => {
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: "2024-01-15", amountValue: 100 }),
        createFact({ id: "2", dateValue: "2024-02-15", amountValue: 100 }),
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(false);
      expect(classification?.evidenceCount).toBe(2);
    });

    it("should not classify with missing amounts", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
        createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: null }), // Missing amount
        createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 100 }),
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      // Only 2 facts with amounts
      expect(classification?.isMonthly).toBe(false);
    });

    it("should not classify with missing dates", () => {
      const facts: FactRecord[] = [
        createFact({ id: "1", dateValue: "2024-01-15", amountValue: 100 }),
        createFact({ id: "2", dateValue: null, amountValue: 100 }), // Missing date
        createFact({ id: "3", dateValue: "2024-03-15", amountValue: 100 }),
      ];

      const result = classifyMonthlyByEntity(facts);
      const classification = result.get("TEST ENTITY");

      expect(classification?.isMonthly).toBe(false);
    });
  });

  describe("multiple entities", () => {
    it("should classify each entity independently", () => {
      const baseDate = "2024-01-15";
      const facts: FactRecord[] = [
        // Entity A - monthly
        createFact({ id: "a1", dateValue: baseDate, amountValue: 100, entityCanonical: "ENTITY A" }),
        createFact({ id: "a2", dateValue: daysFrom(baseDate, 30), amountValue: 100, entityCanonical: "ENTITY A" }),
        createFact({ id: "a3", dateValue: daysFrom(baseDate, 60), amountValue: 100, entityCanonical: "ENTITY A" }),
        // Entity B - irregular
        createFact({ id: "b1", dateValue: baseDate, amountValue: 50, entityCanonical: "ENTITY B" }),
        createFact({ id: "b2", dateValue: daysFrom(baseDate, 14), amountValue: 50, entityCanonical: "ENTITY B" }), // 14 days
        createFact({ id: "b3", dateValue: daysFrom(baseDate, 45), amountValue: 50, entityCanonical: "ENTITY B" }), // 31 days
      ];

      const result = classifyMonthlyByEntity(facts);

      expect(result.get("ENTITY A")?.isMonthly).toBe(true);
      expect(result.get("ENTITY B")?.isMonthly).toBe(false);
    });
  });
});

describe("isEntityMonthly", () => {
  it("should return true for monthly classified entities", () => {
    const baseDate = "2024-01-15";
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 100 }),
    ];

    const classifications = classifyMonthlyByEntity(facts);

    expect(isEntityMonthly("TEST ENTITY", classifications)).toBe(true);
  });

  it("should return false for non-monthly entities", () => {
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: "2024-01-15", amountValue: 100 }),
      createFact({ id: "2", dateValue: "2024-01-20", amountValue: 100 }), // 5 days
      createFact({ id: "3", dateValue: "2024-01-25", amountValue: 100 }), // 5 days
    ];

    const classifications = classifyMonthlyByEntity(facts);

    expect(isEntityMonthly("TEST ENTITY", classifications)).toBe(false);
  });

  it("should return false for unknown entities", () => {
    const classifications = classifyMonthlyByEntity([]);

    expect(isEntityMonthly("UNKNOWN ENTITY", classifications)).toBe(false);
  });
});

describe("tiered classification", () => {
  it("should classify as strict tier with tight intervals and amounts", () => {
    const baseDate = "2024-01-15";
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 100 }),
    ];

    const result = classifyMonthlyByEntity(facts);
    const classification = result.get("TEST ENTITY");

    expect(classification?.isMonthly).toBe(true);
    expect(classification?.tier).toBe("strict");
    expect(classification?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("should classify as likely tier with looser intervals (28-35 days)", () => {
    const baseDate = "2024-01-15";
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 34), amountValue: 100 }), // 34 days
      createFact({ id: "3", dateValue: daysFrom(baseDate, 68), amountValue: 100 }), // 34 days
      createFact({ id: "4", dateValue: daysFrom(baseDate, 102), amountValue: 100 }), // Need 4 for likely
    ];

    const result = classifyMonthlyByEntity(facts);
    const classification = result.get("TEST ENTITY");

    expect(classification?.isMonthly).toBe(true);
    expect(classification?.tier).toBe("likely");
    expect(classification?.confidence).toBeLessThanOrEqual(0.75);
  });

  it("should classify as likely tier with looser amounts (within 20%)", () => {
    const baseDate = "2024-01-15";
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 115 }), // 15% higher
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 85 }),  // 15% lower
      createFact({ id: "4", dateValue: daysFrom(baseDate, 90), amountValue: 100 }),
    ];

    const result = classifyMonthlyByEntity(facts);
    const classification = result.get("TEST ENTITY");

    expect(classification?.isMonthly).toBe(true);
    expect(classification?.tier).toBe("likely");
  });

  it("should not classify with intervals outside loose range (>35 days)", () => {
    const baseDate = "2024-01-15";
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 40), amountValue: 100 }), // 40 days - too long
      createFact({ id: "3", dateValue: daysFrom(baseDate, 80), amountValue: 100 }),
      createFact({ id: "4", dateValue: daysFrom(baseDate, 120), amountValue: 100 }),
    ];

    const result = classifyMonthlyByEntity(facts);
    const classification = result.get("TEST ENTITY");

    expect(classification?.isMonthly).toBe(false);
    expect(classification?.tier).toBe("none");
  });

  it("should require 4 occurrences for likely tier", () => {
    const baseDate = "2024-01-15";
    // Only 3 occurrences with loose intervals - not enough for likely tier
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 34), amountValue: 100 }), // 34 days - loose
      createFact({ id: "3", dateValue: daysFrom(baseDate, 68), amountValue: 100 }),
    ];

    const result = classifyMonthlyByEntity(facts);
    const classification = result.get("TEST ENTITY");

    // Should not qualify as isMonthly since strict fails and likely needs 4
    expect(classification?.isMonthly).toBe(false);
  });

  it("should track interval stats for both ranges", () => {
    const baseDate = "2024-01-15";
    const facts: FactRecord[] = [
      createFact({ id: "1", dateValue: baseDate, amountValue: 100 }),
      createFact({ id: "2", dateValue: daysFrom(baseDate, 30), amountValue: 100 }),
      createFact({ id: "3", dateValue: daysFrom(baseDate, 60), amountValue: 100 }),
    ];

    const result = classifyMonthlyByEntity(facts);
    const classification = result.get("TEST ENTITY");

    expect(classification?.intervalStats?.withinRange).toBe(2);
    expect(classification?.intervalStats?.withinLooseRange).toBe(2);
  });
});
