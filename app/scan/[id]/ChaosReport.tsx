"use client";

import { useState } from "react";

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
}

interface Evidence {
  id: string;
  fact: Fact;
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
}

const NOT_FLAGGED_DEFAULTS = [
  "Conservative analysis—only high-confidence patterns are flagged",
  "Manual review may identify additional issues",
];

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

function IssueCard({ issue }: { issue: Issue }) {
  const [expanded, setExpanded] = useState(false);
  const rationale = Array.isArray(issue.rationaleJson)
    ? (issue.rationaleJson as string[])
    : [];

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

export function ChaosReport({ issues, executiveSummary, facts }: ChaosReportProps) {
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

  // Generate not-flagged items based on facts
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
    notFlagged.push(...NOT_FLAGGED_DEFAULTS);
  }

  return (
    <div className="chaos-report">
      <h2>Chaos Report</h2>

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
        <h3>Flagged Issues</h3>
        {issues.length === 0 ? (
          <div className="no-issues">
            <p>No high-confidence issues detected (conservative scan).</p>
            <p className="hint">
              This does not guarantee absence of issues—only that none met the detection thresholds.
            </p>
          </div>
        ) : (
          <div className="issues-list">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </div>

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
