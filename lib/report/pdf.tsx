import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";

// PDF Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#666",
    marginBottom: 8,
  },
  scanInfo: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  scanInfoItem: {
    flexDirection: "column",
  },
  label: {
    fontSize: 8,
    color: "#666",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  value: {
    fontSize: 10,
    fontWeight: "bold",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#0066cc",
  },
  summaryBox: {
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 4,
    marginBottom: 12,
  },
  summaryStats: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 8,
  },
  stat: {
    flexDirection: "column",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 8,
    color: "#666",
    textTransform: "uppercase",
  },
  summaryText: {
    fontSize: 10,
    lineHeight: 1.5,
    color: "#333",
  },
  capNote: {
    fontSize: 9,
    color: "#666",
    fontStyle: "italic",
    marginTop: 6,
  },
  issueCard: {
    marginBottom: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 4,
  },
  issueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  severityBadge: {
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
  },
  severityHigh: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
  },
  severityMedium: {
    backgroundColor: "#fef3c7",
    color: "#92400e",
  },
  severityLow: {
    backgroundColor: "#e0e7ff",
    color: "#3730a3",
  },
  issueTitle: {
    fontSize: 11,
    fontWeight: "bold",
    flex: 1,
  },
  issueMeta: {
    flexDirection: "row",
    gap: 16,
    fontSize: 9,
    color: "#666",
    marginBottom: 6,
  },
  evidenceSummary: {
    backgroundColor: "#f0f7ff",
    padding: 6,
    borderRadius: 3,
    marginBottom: 6,
  },
  evidenceSummaryText: {
    fontSize: 9,
    color: "#0052a3",
  },
  evidenceTable: {
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 3,
  },
  evidenceHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  evidenceHeaderCell: {
    fontSize: 7,
    fontWeight: "bold",
    color: "#555",
    textTransform: "uppercase",
  },
  evidenceRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  evidenceCell: {
    fontSize: 8,
    color: "#444",
  },
  evidenceMore: {
    fontSize: 8,
    color: "#666",
    fontStyle: "italic",
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  sourceReferences: {
    backgroundColor: "#f5f5f5",
    padding: 6,
    borderRadius: 3,
    marginBottom: 6,
  },
  sourceLabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#555",
    marginBottom: 2,
  },
  sourceText: {
    fontSize: 8,
    color: "#666",
    fontFamily: "Courier",
  },
  rationaleList: {
    marginLeft: 8,
  },
  rationaleItem: {
    fontSize: 9,
    marginBottom: 3,
    color: "#444",
  },
  notFlaggedList: {
    marginLeft: 8,
  },
  notFlaggedItem: {
    fontSize: 9,
    marginBottom: 4,
    color: "#64748b",
  },
  limitsBox: {
    backgroundColor: "#fafafa",
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  limitsTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#555",
    marginBottom: 6,
  },
  limitsItem: {
    fontSize: 8,
    color: "#666",
    marginBottom: 2,
  },
  bullet: {
    marginRight: 6,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#999",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
});

interface RationaleJson {
  rationale?: string[];
  evidenceSummary?: string;
  evidenceStats?: {
    sourceReferences?: string[];
  };
}

function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount === null) return "unknown";
  const curr = currency || "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 0,
  }).format(amount);
}

function parseRationaleJson(json: unknown): {
  rationale: string[];
  evidenceSummary: string | null;
  sourceReferences: string[];
} {
  if (Array.isArray(json)) {
    return { rationale: json as string[], evidenceSummary: null, sourceReferences: [] };
  }
  if (json && typeof json === "object") {
    const obj = json as RationaleJson;
    return {
      rationale: obj.rationale || [],
      evidenceSummary: obj.evidenceSummary || null,
      sourceReferences: obj.evidenceStats?.sourceReferences || [],
    };
  }
  return { rationale: [], evidenceSummary: null, sourceReferences: [] };
}

export interface EvidenceFact {
  id: string;
  entityName: string | null;
  amountValue: number | null;
  amountCurrency: string | null;
  dateValue: string | null;
  status: string;
  sourceReference: string;
}

export interface PdfIssue {
  id: string;
  issueType: string;
  title: string;
  severity: string;
  confidence: number;
  impactMin: number | null;
  impactMax: number | null;
  currency: string | null;
  rationaleJson: unknown;
  entityName: string | null;
  evidenceFacts: EvidenceFact[];
}

export interface PdfFact {
  id: string;
  factType: string;
  status: string;
}

export interface ScanPdfData {
  scanId: string;
  createdAt: Date;
  extractionConfidence: string | null;
  issues: PdfIssue[];
  facts: PdfFact[];
  executiveSummary: string | null;
  wasCapped?: boolean;
  maxIssues?: number;
}

const MAX_EVIDENCE_ROWS = 5;

function ChaosReportPDF({ data }: { data: ScanPdfData }) {
  const {
    scanId,
    createdAt,
    extractionConfidence,
    issues,
    facts,
    executiveSummary,
    wasCapped,
    maxIssues,
  } = data;

  const highCount = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;
  const lowCount = issues.filter((i) => i.severity === "low").length;

  // Calculate total impact
  const issuesWithImpact = issues.filter((i) => i.impactMin !== null);
  let totalImpact: string | null = null;
  if (issuesWithImpact.length > 0) {
    const total = issuesWithImpact.reduce((sum, i) => sum + (i.impactMin || 0), 0);
    totalImpact = formatCurrency(total, issuesWithImpact[0].currency);
  }

  // Generate not-flagged items
  const notFlagged: string[] = [];
  const invoiceCount = facts.filter((f) => f.factType === "invoice").length;
  const paymentCount = facts.filter((f) => f.factType === "payment").length;
  const subscriptionCount = facts.filter((f) => f.factType === "subscription").length;

  if (invoiceCount > 0 && !issues.some((i) => i.issueType === "unpaid_invoice_aging")) {
    notFlagged.push("All invoices are current (none past 45-day threshold)");
  }
  if (paymentCount >= 3 && !issues.some((i) => i.issueType === "recurring_payment_gap")) {
    notFlagged.push("No gaps detected in recurring payment patterns");
  }
  if (paymentCount >= 4 && !issues.some((i) => i.issueType === "amount_drift")) {
    notFlagged.push("Recurring payment amounts are stable");
  }
  if (paymentCount >= 2 && !issues.some((i) => i.issueType === "duplicate_charge")) {
    notFlagged.push("No duplicate charges detected");
  }
  if (subscriptionCount > 0) {
    const activeCount = facts.filter(
      (f) => f.factType === "subscription" && f.status === "active"
    ).length;
    if (activeCount > 0) {
      notFlagged.push(`${activeCount} active subscription(s) confirmed`);
    }
  }

  if (notFlagged.length === 0) {
    notFlagged.push("Conservative analysis—only high-confidence patterns are flagged");
    notFlagged.push("Manual review may identify additional issues");
  }

  // Limits
  const limits = [
    "No reconciliation or matching performed",
    "No tax categorization",
    "No forecasting or predictions",
    "No recommendations provided",
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Revenue & Billing Chaos Scan</Text>
          <Text style={styles.subtitle}>Automated Issue Detection Report</Text>
        </View>

        {/* Scan Info */}
        <View style={styles.scanInfo}>
          <View style={styles.scanInfoItem}>
            <Text style={styles.label}>Scan ID</Text>
            <Text style={styles.value}>{scanId.substring(0, 12)}...</Text>
          </View>
          <View style={styles.scanInfoItem}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{createdAt.toLocaleDateString()}</Text>
          </View>
          <View style={styles.scanInfoItem}>
            <Text style={styles.label}>Extraction</Text>
            <Text style={styles.value}>{extractionConfidence || "N/A"}</Text>
          </View>
          <View style={styles.scanInfoItem}>
            <Text style={styles.label}>Facts Analyzed</Text>
            <Text style={styles.value}>{facts.length}</Text>
          </View>
          <View style={styles.scanInfoItem}>
            <Text style={styles.label}>Issues Found</Text>
            <Text style={styles.value}>{issues.length}</Text>
          </View>
        </View>

        {/* Executive Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <View style={styles.summaryBox}>
            <View style={styles.summaryStats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{issues.length}</Text>
                <Text style={styles.statLabel}>Issues</Text>
              </View>
              {totalImpact ? (
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{totalImpact}</Text>
                  <Text style={styles.statLabel}>Est. Impact</Text>
                </View>
              ) : (
                <View style={styles.stat}>
                  <Text style={styles.statValue}>Unknown</Text>
                  <Text style={styles.statLabel}>Impact</Text>
                </View>
              )}
              {highCount > 0 && (
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: "#b91c1c" }]}>{highCount}</Text>
                  <Text style={styles.statLabel}>High</Text>
                </View>
              )}
              {mediumCount > 0 && (
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: "#92400e" }]}>{mediumCount}</Text>
                  <Text style={styles.statLabel}>Medium</Text>
                </View>
              )}
              {lowCount > 0 && (
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: "#3730a3" }]}>{lowCount}</Text>
                  <Text style={styles.statLabel}>Low</Text>
                </View>
              )}
            </View>
            {executiveSummary && (
              <Text style={styles.summaryText}>{executiveSummary}</Text>
            )}
            {wasCapped && maxIssues && (
              <Text style={styles.capNote}>
                Showing top {maxIssues} issues (conservative cap). Some lower-confidence items were omitted.
              </Text>
            )}
          </View>
        </View>

        {/* Issues List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Flagged Issues</Text>
          {issues.length === 0 ? (
            <Text style={styles.summaryText}>
              No high-confidence issues detected. This does not guarantee absence of issues.
            </Text>
          ) : (
            issues.map((issue) => {
              const { rationale, evidenceSummary, sourceReferences } = parseRationaleJson(
                issue.rationaleJson
              );
              const uniqueSources = [...new Set(sourceReferences)];
              const evidenceToShow = issue.evidenceFacts.slice(0, MAX_EVIDENCE_ROWS);
              const moreEvidence = issue.evidenceFacts.length - MAX_EVIDENCE_ROWS;

              const impactDisplay =
                issue.impactMin !== null
                  ? issue.impactMax !== null && issue.impactMax !== issue.impactMin
                    ? `${formatCurrency(issue.impactMin, issue.currency)}–${formatCurrency(issue.impactMax, issue.currency)}`
                    : formatCurrency(issue.impactMin, issue.currency)
                  : "Unknown";

              const severityStyle =
                issue.severity === "high"
                  ? styles.severityHigh
                  : issue.severity === "medium"
                  ? styles.severityMedium
                  : styles.severityLow;

              return (
                <View key={issue.id} style={styles.issueCard} wrap={false}>
                  <View style={styles.issueHeader}>
                    <Text style={[styles.severityBadge, severityStyle]}>
                      {issue.severity}
                    </Text>
                    <Text style={styles.issueTitle}>{issue.title}</Text>
                  </View>

                  <View style={styles.issueMeta}>
                    <Text>Confidence: {(issue.confidence * 100).toFixed(0)}%</Text>
                    <Text>Impact: {impactDisplay}</Text>
                  </View>

                  {evidenceSummary && (
                    <View style={styles.evidenceSummary}>
                      <Text style={styles.evidenceSummaryText}>
                        Evidence: {evidenceSummary}
                      </Text>
                    </View>
                  )}

                  {/* Evidence Table */}
                  {evidenceToShow.length > 0 && (
                    <View style={styles.evidenceTable}>
                      <View style={styles.evidenceHeader}>
                        <Text style={[styles.evidenceHeaderCell, { width: "25%" }]}>Entity</Text>
                        <Text style={[styles.evidenceHeaderCell, { width: "20%" }]}>Amount</Text>
                        <Text style={[styles.evidenceHeaderCell, { width: "18%" }]}>Date</Text>
                        <Text style={[styles.evidenceHeaderCell, { width: "12%" }]}>Status</Text>
                        <Text style={[styles.evidenceHeaderCell, { width: "25%" }]}>Source</Text>
                      </View>
                      {evidenceToShow.map((fact, idx) => (
                        <View key={fact.id || idx} style={styles.evidenceRow}>
                          <Text style={[styles.evidenceCell, { width: "25%" }]}>
                            {fact.entityName || "-"}
                          </Text>
                          <Text style={[styles.evidenceCell, { width: "20%" }]}>
                            {fact.amountValue !== null
                              ? formatCurrency(fact.amountValue, fact.amountCurrency)
                              : "-"}
                          </Text>
                          <Text style={[styles.evidenceCell, { width: "18%" }]}>
                            {fact.dateValue || "-"}
                          </Text>
                          <Text style={[styles.evidenceCell, { width: "12%" }]}>
                            {fact.status}
                          </Text>
                          <Text style={[styles.evidenceCell, { width: "25%" }]}>
                            {fact.sourceReference}
                          </Text>
                        </View>
                      ))}
                      {moreEvidence > 0 && (
                        <Text style={styles.evidenceMore}>+{moreEvidence} more evidence rows</Text>
                      )}
                    </View>
                  )}

                  {/* Fallback to source references if no evidence facts */}
                  {evidenceToShow.length === 0 && uniqueSources.length > 0 && (
                    <View style={styles.sourceReferences}>
                      <Text style={styles.sourceLabel}>Sources:</Text>
                      <Text style={styles.sourceText}>{uniqueSources.join(", ")}</Text>
                    </View>
                  )}

                  <View style={styles.rationaleList}>
                    {rationale.slice(0, 4).map((r, i) => (
                      <Text key={i} style={styles.rationaleItem}>
                        <Text style={styles.bullet}>•</Text> {r}
                      </Text>
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* What We Did NOT Flag */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What We Did NOT Flag</Text>
          <View style={styles.notFlaggedList}>
            {notFlagged.map((item, i) => (
              <Text key={i} style={styles.notFlaggedItem}>
                <Text style={styles.bullet}>•</Text> {item}
              </Text>
            ))}
          </View>
        </View>

        {/* Limits */}
        <View style={styles.section}>
          <View style={styles.limitsBox}>
            <Text style={styles.limitsTitle}>Scope Limitations</Text>
            {limits.map((item, i) => (
              <Text key={i} style={styles.limitsItem}>
                <Text style={styles.bullet}>•</Text> {item}
              </Text>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Generated by Chaos Scan</Text>
          <Text>{new Date().toLocaleString()}</Text>
        </View>
      </Page>
    </Document>
  );
}

/**
 * Generate a PDF buffer for a scan report.
 * This is the main export for PDF generation.
 */
export async function generateScanPdf(data: ScanPdfData): Promise<Buffer> {
  const pdfBuffer = await renderToBuffer(<ChaosReportPDF data={data} />);
  return pdfBuffer;
}
