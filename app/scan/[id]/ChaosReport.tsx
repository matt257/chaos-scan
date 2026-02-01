"use client";

import { useState } from "react";

type ScanMode = "bank" | "billing";

interface Fact {
  id: string;
  factType: string;
  entityName: string | null;
  amountValue: number | null;
  amountCurrency: string | null;
  dateValue: string | null;
  dateType: string | null;
  status: string;
  recurrence: string;
  sourceReference: string;
  confidence: number;
  direction?: string;
  clearingStatus?: string;
}

interface BankInsights {
  recurringMerchantCount: number;
  recurringMerchants: Array<{
    name: string;
    monthlyAmount: number | null;
    currency: string | null;
    occurrences: number;
  }>;
  totalMonthlyRecurring: number | null;
  recurringCurrency: string | null;
  canSumRecurring: boolean;
  totalTransactions: number;
  totalOutflows: number;
  dateRange: { start: string; end: string } | null;
}

interface BankDiagnostics {
  totalFacts: number;
  withDateCount: number;
  missingDateCount: number;
  dateParseFailureRate: number;
  qualifyingForAnalysis: number;
  uniqueMerchants: number;
  candidateRecurringMerchants: number;
  topBlockers: string[];
}

interface Evidence {
  id: string;
  fact: Fact;
}

interface EvidenceStats {
  count: number;
  dateRange: { start: string; end: string } | null;
  medianAmount: number | null;
  currency: string | null;
  sourceReferences: string[];
}

interface RationaleJson {
  rationale?: string[];
  evidenceSummary?: string;
  evidenceStats?: EvidenceStats;
}

interface Issue {
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
  evidence: Evidence[];
}

interface ChaosReportProps {
  issues: Issue[];
  executiveSummary: string | null;
  facts: Fact[];
  scanMode?: ScanMode;
  bankInsights?: BankInsights | null;
  bankDiagnostics?: BankDiagnostics | null;
}

const NOT_FLAGGED_DEFAULTS = [
  "Conservative analysis—only high-confidence patterns are flagged",
  "Manual review may identify additional issues",
];

const MAX_ISSUES_CAP = 8;

// Detect scan mode from facts (client-side helper)
function detectScanModeFromFacts(facts: Fact[]): ScanMode {
  if (facts.length === 0) return "billing";
  const factsWithDirection = facts.filter(
    (f) => f.direction === "inflow" || f.direction === "outflow"
  );
  return factsWithDirection.length / facts.length > 0.8 ? "bank" : "billing";
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

function getSeverityClass(severity: string): string {
  switch (severity) {
    case "high":
      return "severity-high";
    case "medium":
      return "severity-medium";
    case "low":
      return "severity-low";
    default:
      return "";
  }
}

function parseRationaleJson(json: unknown): { rationale: string[]; evidenceSummary: string | null; evidenceStats: EvidenceStats | null } {
  // Handle legacy format (array of strings)
  if (Array.isArray(json)) {
    return { rationale: json as string[], evidenceSummary: null, evidenceStats: null };
  }

  // Handle new format (object with rationale, evidenceSummary, evidenceStats)
  if (json && typeof json === "object") {
    const obj = json as RationaleJson;
    return {
      rationale: obj.rationale || [],
      evidenceSummary: obj.evidenceSummary || null,
      evidenceStats: obj.evidenceStats || null,
    };
  }

  return { rationale: [], evidenceSummary: null, evidenceStats: null };
}

function IssueCard({ issue }: { issue: Issue }) {
  const [expanded, setExpanded] = useState(false);
  const { rationale, evidenceSummary, evidenceStats } = parseRationaleJson(issue.rationaleJson);

  // Get source references from evidenceStats or from evidence facts
  const sourceReferences = evidenceStats?.sourceReferences ||
    issue.evidence.map((e) => e.fact.sourceReference);
  const uniqueSources = [...new Set(sourceReferences)];

  const impactDisplay =
    issue.impactMin !== null
      ? issue.impactMin === issue.impactMax
        ? formatCurrency(issue.impactMin, issue.currency)
        : `${formatCurrency(issue.impactMin, issue.currency)}–${formatCurrency(issue.impactMax, issue.currency)}`
      : "Unknown";

  return (
    <div className="issue-card">
      <div className="issue-header" onClick={() => setExpanded(!expanded)}>
        <div className="issue-title-row">
          <span className={`severity-badge ${getSeverityClass(issue.severity)}`}>
            {issue.severity}
          </span>
          <span className="issue-title">{issue.title}</span>
          <span className="expand-toggle">{expanded ? "▼" : "▶"}</span>
        </div>
        <div className="issue-meta">
          <span>Confidence: {(issue.confidence * 100).toFixed(0)}%</span>
          <span>Impact: {impactDisplay}</span>
        </div>
      </div>

      {expanded && (
        <div className="issue-details">
          {/* Evidence Summary - shown prominently above rationale */}
          {evidenceSummary && (
            <div className="evidence-summary">
              <strong>Evidence summary:</strong> {evidenceSummary}
            </div>
          )}

          {/* Source References - shown prominently */}
          {uniqueSources.length > 0 && (
            <div className="source-references">
              <strong>Sources:</strong>{" "}
              <span className="source-list">{uniqueSources.join(", ")}</span>
            </div>
          )}

          <div className="rationale-section">
            <strong>Why this was flagged:</strong>
            <ul>
              {rationale.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>

          {issue.evidence.length > 0 && (
            <div className="evidence-section">
              <strong>Evidence ({issue.evidence.length} fact{issue.evidence.length !== 1 ? "s" : ""}):</strong>
              <div className="evidence-table-wrapper">
                <table className="evidence-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Entity</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issue.evidence.map((e) => (
                      <tr key={e.id}>
                        <td>{e.fact.factType}</td>
                        <td>{e.fact.entityName || "-"}</td>
                        <td>
                          {e.fact.amountValue !== null
                            ? formatCurrency(e.fact.amountValue, e.fact.amountCurrency)
                            : "-"}
                        </td>
                        <td>
                          {e.fact.dateValue || "-"}
                          {e.fact.dateType && e.fact.dateValue && (
                            <span className="date-type"> ({e.fact.dateType})</span>
                          )}
                        </td>
                        <td>{e.fact.status}</td>
                        <td className="source-ref">{e.fact.sourceReference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChaosReport({ issues, executiveSummary, facts, scanMode, bankInsights, bankDiagnostics }: ChaosReportProps) {
  const highCount = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;
  const lowCount = issues.filter((i) => i.severity === "low").length;

  // Detect scan mode from facts if not provided
  const effectiveScanMode = scanMode || detectScanModeFromFacts(facts);
  const isBankMode = effectiveScanMode === "bank";

  // Check if we hit the cap
  const isCapped = issues.length >= MAX_ISSUES_CAP;

  // Calculate total impact
  const issuesWithImpact = issues.filter((i) => i.impactMin !== null);
  let totalImpact: string | null = null;
  if (issuesWithImpact.length > 0) {
    const total = issuesWithImpact.reduce((sum, i) => sum + (i.impactMin || 0), 0);
    totalImpact = formatCurrency(total, issuesWithImpact[0].currency);
  }

  // Generate not-flagged items based on scan mode
  const notFlagged: string[] = [];

  if (isBankMode) {
    // Bank mode not-flagged items
    const outflowCount = facts.filter(
      (f) => f.direction === "outflow" && f.clearingStatus === "cleared"
    ).length;

    if (outflowCount >= 10 && !issues.some((i) => i.issueType === "new_recurring_charge")) {
      notFlagged.push("No new recurring charges started in the last 60 days");
    }
    if (outflowCount >= 10 && !issues.some((i) => i.issueType === "price_creep")) {
      notFlagged.push("No significant price increases on recurring charges");
    }
    if (outflowCount >= 2 && !issues.some((i) => i.issueType === "duplicate_charge")) {
      notFlagged.push("No duplicate charges detected");
    }
    if (outflowCount >= 10 && !issues.some((i) => i.issueType === "unusual_spike")) {
      notFlagged.push("No unusually high charges vs merchant baselines");
    }
    if (bankInsights && bankInsights.recurringMerchantCount > 0) {
      notFlagged.push(
        `${bankInsights.recurringMerchantCount} recurring merchant(s) with stable patterns`
      );
    }
  } else {
    // Billing mode not-flagged items
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
  }

  if (notFlagged.length === 0) {
    notFlagged.push(...NOT_FLAGGED_DEFAULTS);
  }

  const reportTitle = isBankMode
    ? "Bank & Card Transaction Chaos Report"
    : "Chaos Report";

  const noIssuesMessage = isBankMode
    ? "No high-confidence issues detected in your transactions (conservative scan)."
    : "No high-confidence issues detected (conservative scan).";

  return (
    <div className="chaos-report">
      <h2>{reportTitle}</h2>

      {/* Executive Summary */}
      <div className="card executive-summary">
        <h3>Executive Summary</h3>
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-value">{issues.length}</span>
            <span className="stat-label">Issues Found</span>
          </div>
          {totalImpact && (
            <div className="stat">
              <span className="stat-value">{totalImpact}</span>
              <span className="stat-label">Est. Impact</span>
            </div>
          )}
          <div className="stat-breakdown">
            {highCount > 0 && <span className="severity-badge severity-high">{highCount} high</span>}
            {mediumCount > 0 && <span className="severity-badge severity-medium">{mediumCount} medium</span>}
            {lowCount > 0 && <span className="severity-badge severity-low">{lowCount} low</span>}
          </div>
        </div>

        {issues.length > 0 && (
          <div className="top-issues">
            <strong>Top issues:</strong>
            <ul>
              {issues.slice(0, 3).map((issue) => (
                <li key={issue.id}>{issue.title}</li>
              ))}
            </ul>
          </div>
        )}

        {executiveSummary && (
          <p className="summary-text">{executiveSummary}</p>
        )}
      </div>

      {/* Flagged Issues */}
      <div className="card">
        <div className="section-header">
          <h3>Flagged Issues</h3>
          {isCapped && (
            <span className="cap-message">
              Showing top {MAX_ISSUES_CAP} issues (conservative cap)
            </span>
          )}
        </div>
        {issues.length === 0 ? (
          <div className="no-issues">
            <p>{noIssuesMessage}</p>
            <p className="hint">
              This does not guarantee absence of issues—only that none met the detection thresholds.
            </p>

            {/* Bank Diagnostics - shown when no issues found in bank mode */}
            {isBankMode && bankDiagnostics && (
              <div className="diagnostics-section">
                <h4>Why no issues?</h4>
                <div className="diagnostics-stats">
                  <div className="diag-stat">
                    <span className="diag-value">{bankDiagnostics.totalFacts}</span>
                    <span className="diag-label">Total Transactions</span>
                  </div>
                  <div className="diag-stat">
                    <span className="diag-value">{bankDiagnostics.withDateCount}</span>
                    <span className="diag-label">With Parseable Date</span>
                  </div>
                  <div className="diag-stat">
                    <span className="diag-value">{bankDiagnostics.qualifyingForAnalysis}</span>
                    <span className="diag-label">Qualifying for Analysis</span>
                  </div>
                  <div className="diag-stat">
                    <span className="diag-value">{bankDiagnostics.candidateRecurringMerchants}</span>
                    <span className="diag-label">Recurrence Candidates</span>
                  </div>
                </div>
                {bankDiagnostics.topBlockers.length > 0 && (
                  <div className="top-blockers">
                    <strong>Top blockers:</strong>
                    <ul>
                      {bankDiagnostics.topBlockers.map((blocker, i) => (
                        <li key={i}>{blocker}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="issues-list">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </div>

      {/* Bank Insights - only shown in bank mode */}
      {isBankMode && bankInsights && bankInsights.recurringMerchantCount > 0 && (
        <div className="card bank-insights">
          <h3>Recurring Charges Summary</h3>
          <div className="insights-summary">
            <div className="insight-stat">
              <span className="stat-value">{bankInsights.recurringMerchantCount}</span>
              <span className="stat-label">Monthly Recurring</span>
            </div>
            {bankInsights.canSumRecurring && bankInsights.totalMonthlyRecurring !== null && (
              <div className="insight-stat">
                <span className="stat-value">
                  {formatCurrency(bankInsights.totalMonthlyRecurring, bankInsights.recurringCurrency)}
                </span>
                <span className="stat-label">Est. Monthly Spend</span>
              </div>
            )}
          </div>
          {bankInsights.recurringMerchants.length > 0 && (
            <div className="recurring-list">
              <table className="recurring-table">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Monthly Amount</th>
                    <th>Occurrences</th>
                  </tr>
                </thead>
                <tbody>
                  {bankInsights.recurringMerchants.slice(0, 10).map((m, i) => (
                    <tr key={i}>
                      <td>{m.name}</td>
                      <td>
                        {m.monthlyAmount !== null
                          ? formatCurrency(m.monthlyAmount, m.currency)
                          : "-"}
                      </td>
                      <td>{m.occurrences}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bankInsights.recurringMerchants.length > 10 && (
                <p className="more-hint">
                  +{bankInsights.recurringMerchants.length - 10} more recurring merchants
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* What we did NOT flag */}
      <div className="card not-flagged">
        <h3>What We Did NOT Flag</h3>
        <ul>
          {notFlagged.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
