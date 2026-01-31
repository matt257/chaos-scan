import { describe, it, expect } from "vitest";
import { pruneIssues } from "../pruneIssues";
import { ProposedIssue } from "../types";

function createIssue(overrides: Partial<ProposedIssue> = {}): ProposedIssue {
  return {
    issueType: "unpaid_invoice_aging",
    title: "Test Issue",
    severity: "medium",
    confidence: 0.8,
    impactMin: 1000,
    impactMax: 1000,
    currency: "USD",
    rationale: ["Test rationale"],
    evidenceFactIds: ["fact1", "fact2"],
    entityName: "Test Entity",
    ...overrides,
  };
}

describe("pruneIssues", () => {
  describe("sorting", () => {
    it("should sort by severity (high first)", () => {
      const issues: ProposedIssue[] = [
        createIssue({ severity: "low", title: "Low", entityName: "Entity A" }),
        createIssue({ severity: "high", title: "High", entityName: "Entity B" }),
        createIssue({ severity: "medium", title: "Medium", entityName: "Entity C" }),
      ];

      const result = pruneIssues(issues);

      expect(result.issues[0].title).toBe("High");
      expect(result.issues[1].title).toBe("Medium");
      expect(result.issues[2].title).toBe("Low");
    });

    it("should sort by confidence when severity is equal", () => {
      const issues: ProposedIssue[] = [
        createIssue({ severity: "high", confidence: 0.7, title: "Lower Confidence", entityName: "Entity A" }),
        createIssue({ severity: "high", confidence: 0.95, title: "Higher Confidence", entityName: "Entity B" }),
      ];

      const result = pruneIssues(issues);

      expect(result.issues[0].title).toBe("Higher Confidence");
      expect(result.issues[1].title).toBe("Lower Confidence");
    });

    it("should sort by impact when severity and confidence are equal", () => {
      const issues: ProposedIssue[] = [
        createIssue({ severity: "high", confidence: 0.9, impactMin: 500, title: "Low Impact", entityName: "Entity A" }),
        createIssue({ severity: "high", confidence: 0.9, impactMin: 5000, title: "High Impact", entityName: "Entity B" }),
      ];

      const result = pruneIssues(issues);

      expect(result.issues[0].title).toBe("High Impact");
      expect(result.issues[1].title).toBe("Low Impact");
    });
  });

  describe("low evidence filtering", () => {
    it("should filter out recurring_payment_gap with fewer than 3 evidence facts", () => {
      const issues: ProposedIssue[] = [
        createIssue({
          issueType: "recurring_payment_gap",
          evidenceFactIds: ["fact1", "fact2"], // Only 2
          title: "Gap Issue",
        }),
        createIssue({
          issueType: "unpaid_invoice_aging",
          evidenceFactIds: ["fact1"],
          title: "Aging Issue",
        }),
      ];

      const result = pruneIssues(issues);

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].title).toBe("Aging Issue");
      expect(result.droppedLowEvidence).toBe(1);
    });

    it("should filter out amount_drift with fewer than 4 evidence facts", () => {
      const issues: ProposedIssue[] = [
        createIssue({
          issueType: "amount_drift",
          evidenceFactIds: ["f1", "f2", "f3"], // Only 3
          title: "Drift Issue",
        }),
      ];

      const result = pruneIssues(issues);

      expect(result.issues).toHaveLength(0);
      expect(result.droppedLowEvidence).toBe(1);
    });

    it("should keep amount_drift with 4+ evidence facts", () => {
      const issues: ProposedIssue[] = [
        createIssue({
          issueType: "amount_drift",
          evidenceFactIds: ["f1", "f2", "f3", "f4"],
          title: "Drift Issue",
        }),
      ];

      const result = pruneIssues(issues);

      expect(result.issues).toHaveLength(1);
      expect(result.droppedLowEvidence).toBe(0);
    });

    it("should filter out duplicate_charge with fewer than 2 evidence facts", () => {
      const issues: ProposedIssue[] = [
        createIssue({
          issueType: "duplicate_charge",
          evidenceFactIds: ["f1"], // Only 1
          title: "Duplicate Issue",
        }),
      ];

      const result = pruneIssues(issues);

      expect(result.issues).toHaveLength(0);
      expect(result.droppedLowEvidence).toBe(1);
    });
  });

  describe("deduplication", () => {
    it("should keep only one issue per entity + detector combination", () => {
      const issues: ProposedIssue[] = [
        createIssue({
          issueType: "unpaid_invoice_aging",
          entityName: "Acme Corp",
          severity: "high",
          title: "First Aging",
        }),
        createIssue({
          issueType: "unpaid_invoice_aging",
          entityName: "Acme Corp",
          severity: "medium",
          title: "Second Aging",
        }),
      ];

      const result = pruneIssues(issues);

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].title).toBe("First Aging"); // Higher severity kept
      expect(result.droppedDuplicates).toBe(1);
    });

    it("should allow same entity with different detector types", () => {
      const issues: ProposedIssue[] = [
        createIssue({
          issueType: "unpaid_invoice_aging",
          entityName: "Acme Corp",
          title: "Aging Issue",
        }),
        createIssue({
          issueType: "recurring_payment_gap",
          entityName: "Acme Corp",
          evidenceFactIds: ["f1", "f2", "f3"],
          title: "Gap Issue",
        }),
      ];

      const result = pruneIssues(issues);

      expect(result.issues).toHaveLength(2);
      expect(result.droppedDuplicates).toBe(0);
    });

    it("should allow same detector type with different entities", () => {
      const issues: ProposedIssue[] = [
        createIssue({
          issueType: "unpaid_invoice_aging",
          entityName: "Acme Corp",
          title: "Acme Aging",
        }),
        createIssue({
          issueType: "unpaid_invoice_aging",
          entityName: "Beta Inc",
          title: "Beta Aging",
        }),
      ];

      const result = pruneIssues(issues);

      expect(result.issues).toHaveLength(2);
      expect(result.droppedDuplicates).toBe(0);
    });
  });

  describe("capping", () => {
    it("should cap issues to maxIssues (default 8)", () => {
      const issues: ProposedIssue[] = Array.from({ length: 12 }, (_, i) =>
        createIssue({
          entityName: `Entity ${i}`,
          title: `Issue ${i}`,
        })
      );

      const result = pruneIssues(issues);

      expect(result.issues).toHaveLength(8);
      expect(result.droppedByCap).toBe(4);
      expect(result.wasCapped).toBe(true);
    });

    it("should respect custom maxIssues", () => {
      const issues: ProposedIssue[] = Array.from({ length: 10 }, (_, i) =>
        createIssue({
          entityName: `Entity ${i}`,
          title: `Issue ${i}`,
        })
      );

      const result = pruneIssues(issues, { maxIssues: 5 });

      expect(result.issues).toHaveLength(5);
      expect(result.droppedByCap).toBe(5);
      expect(result.wasCapped).toBe(true);
    });

    it("should not set wasCapped if under limit", () => {
      const issues: ProposedIssue[] = [
        createIssue({ title: "Issue 1" }),
        createIssue({ title: "Issue 2", entityName: "Other" }),
      ];

      const result = pruneIssues(issues);

      expect(result.issues).toHaveLength(2);
      expect(result.droppedByCap).toBe(0);
      expect(result.wasCapped).toBe(false);
    });
  });

  describe("combined behavior", () => {
    it("should apply all pruning steps in order", () => {
      const issues: ProposedIssue[] = [
        // High severity, good evidence
        createIssue({
          issueType: "unpaid_invoice_aging",
          entityName: "Acme",
          severity: "high",
          confidence: 0.95,
          title: "High Priority",
        }),
        // Duplicate of above (same entity + detector) - should be removed
        createIssue({
          issueType: "unpaid_invoice_aging",
          entityName: "Acme",
          severity: "low",
          title: "Duplicate",
        }),
        // Low evidence - should be filtered
        createIssue({
          issueType: "amount_drift",
          evidenceFactIds: ["f1", "f2"],
          title: "Low Evidence",
        }),
        // Valid issue
        createIssue({
          issueType: "duplicate_charge",
          entityName: "Beta",
          severity: "low",
          evidenceFactIds: ["f1", "f2"],
          title: "Valid Duplicate Charge",
        }),
      ];

      const result = pruneIssues(issues);

      expect(result.totalBeforePrune).toBe(4);
      expect(result.droppedLowEvidence).toBe(1);
      expect(result.droppedDuplicates).toBe(1);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].title).toBe("High Priority");
      expect(result.issues[1].title).toBe("Valid Duplicate Charge");
    });
  });
});
