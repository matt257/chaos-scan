import { describe, it, expect } from "vitest";
import { generateScanPdf, ScanPdfData } from "../pdf";

function createMockPdfData(overrides: Partial<ScanPdfData> = {}): ScanPdfData {
  return {
    scanId: "test-scan-123456789",
    createdAt: new Date("2024-01-15T10:00:00Z"),
    extractionConfidence: "high",
    issues: [
      {
        id: "issue-1",
        issueType: "unpaid_invoice_aging",
        title: "Aging unpaid invoices for Acme Corp",
        severity: "high",
        confidence: 0.95,
        impactMin: 15000,
        impactMax: 15000,
        currency: "USD",
        rationaleJson: {
          rationale: [
            "2 unpaid invoices older than 45 days",
            "Oldest invoice is 78 days past issue date",
          ],
          evidenceSummary: "2 unpaid invoices from Oct–Nov, median $12,500, oldest 78 days",
          evidenceStats: {
            sourceReferences: ["invoices.csv:89", "invoices.csv:95"],
          },
        },
        entityName: "Acme Corp",
        evidenceFacts: [
          {
            id: "fact-1",
            entityName: "Acme Corp",
            amountValue: 10000,
            amountCurrency: "USD",
            dateValue: "2024-10-15",
            status: "unpaid",
            sourceReference: "invoices.csv:89",
          },
          {
            id: "fact-2",
            entityName: "Acme Corp",
            amountValue: 5000,
            amountCurrency: "USD",
            dateValue: "2024-11-01",
            status: "unpaid",
            sourceReference: "invoices.csv:95",
          },
        ],
      },
      {
        id: "issue-2",
        issueType: "recurring_payment_gap",
        title: "Recurring payment gap for TechStart Inc",
        severity: "medium",
        confidence: 0.85,
        impactMin: 8500,
        impactMax: 17000,
        currency: "USD",
        rationaleJson: {
          rationale: [
            "5 monthly payments detected",
            "Gap of 62 days after 2024-04-12",
            "Approximately 2 payments may be missing",
          ],
          evidenceSummary: "5 payments from Jan–Jul, then 62-day gap",
        },
        entityName: "TechStart Inc",
        evidenceFacts: [
          {
            id: "fact-3",
            entityName: "TechStart Inc",
            amountValue: 8500,
            amountCurrency: "USD",
            dateValue: "2024-01-15",
            status: "paid",
            sourceReference: "payments.csv:10",
          },
        ],
      },
    ],
    facts: [
      { id: "fact-1", factType: "invoice", status: "unpaid" },
      { id: "fact-2", factType: "invoice", status: "unpaid" },
      { id: "fact-3", factType: "payment", status: "paid" },
      { id: "fact-4", factType: "payment", status: "paid" },
      { id: "fact-5", factType: "subscription", status: "active" },
    ],
    executiveSummary:
      "This scan identified 2 potential billing/revenue issues: 1 high-severity, 1 medium-severity. " +
      "Estimated impact: $15,000–$32,000. These findings require manual verification.",
    wasCapped: false,
    maxIssues: 8,
    ...overrides,
  };
}

describe("generateScanPdf", () => {
  it("should generate a PDF buffer with content", async () => {
    const data = createMockPdfData();
    const buffer = await generateScanPdf(data);

    // PDF should be a Buffer with reasonable size
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000); // Minimum threshold for a PDF with content
  });

  it("should start with PDF magic bytes", async () => {
    const data = createMockPdfData();
    const buffer = await generateScanPdf(data);

    // PDF files start with %PDF
    const header = buffer.slice(0, 4).toString("ascii");
    expect(header).toBe("%PDF");
  });

  it("should handle empty issues array", async () => {
    const data = createMockPdfData({
      issues: [],
      executiveSummary: "No issues detected.",
    });
    const buffer = await generateScanPdf(data);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("should handle issues without evidence facts", async () => {
    const data = createMockPdfData({
      issues: [
        {
          id: "issue-1",
          issueType: "duplicate_charge",
          title: "Possible duplicate charge",
          severity: "low",
          confidence: 0.7,
          impactMin: null,
          impactMax: null,
          currency: null,
          rationaleJson: ["2 identical charges on same day"],
          entityName: null,
          evidenceFacts: [],
        },
      ],
    });
    const buffer = await generateScanPdf(data);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("should handle capped issues note", async () => {
    const data = createMockPdfData({
      wasCapped: true,
      maxIssues: 8,
    });
    const buffer = await generateScanPdf(data);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("should handle many evidence facts (truncation)", async () => {
    const manyFacts = Array.from({ length: 10 }, (_, i) => ({
      id: `fact-${i}`,
      entityName: "Test Entity",
      amountValue: 1000 + i * 100,
      amountCurrency: "USD",
      dateValue: `2024-01-${String(i + 1).padStart(2, "0")}`,
      status: "paid",
      sourceReference: `test.csv:${i + 1}`,
    }));

    const data = createMockPdfData({
      issues: [
        {
          id: "issue-many",
          issueType: "amount_drift",
          title: "Amount drift detected",
          severity: "medium",
          confidence: 0.88,
          impactMin: 5000,
          impactMax: 5000,
          currency: "USD",
          rationaleJson: {
            rationale: ["10 payments analyzed", "30% decrease detected"],
          },
          entityName: "Test Entity",
          evidenceFacts: manyFacts,
        },
      ],
    });
    const buffer = await generateScanPdf(data);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
