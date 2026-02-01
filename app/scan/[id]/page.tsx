import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChaosReport } from "./ChaosReport";
import { FactsTable } from "./FactsTable";

interface FactWithBankFields {
  id: string;
  entityName: string | null;
  entityCanonical: string | null;
  amountValue: number | null;
  amountCurrency: string | null;
  dateValue: string | null;
  direction: string;
  clearingStatus: string;
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

// Simple median calculation
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Compute bank insights from facts (server-side)
function computeBankInsights(facts: FactWithBankFields[]): BankInsights {
  const outflows = facts.filter(
    (f) => f.direction === "outflow" && f.clearingStatus === "cleared" && f.amountValue !== null
  );

  // Group by entity
  const byEntity = new Map<string, FactWithBankFields[]>();
  for (const fact of outflows) {
    const key = fact.entityCanonical || fact.entityName || "_unknown_";
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key)!.push(fact);
  }

  // Find monthly recurring (simplified: 3+ occurrences with consistent amounts)
  const recurringMerchants: BankInsights["recurringMerchants"] = [];
  const currencies = new Set<string>();

  for (const [entityKey, entityFacts] of byEntity) {
    if (entityFacts.length < 3) continue;

    const amounts = entityFacts.map((f) => Math.abs(f.amountValue!));
    const medianAmount = median(amounts);

    // Check amount stability (within 10%)
    const isStable = amounts.every((a) => Math.abs(a - medianAmount) / medianAmount <= 0.1);
    if (!isStable) continue;

    const currency = entityFacts[0].amountCurrency;
    if (currency) currencies.add(currency);

    recurringMerchants.push({
      name: entityFacts[0].entityName || entityKey,
      monthlyAmount: medianAmount,
      currency,
      occurrences: entityFacts.length,
    });
  }

  // Sort by amount
  recurringMerchants.sort((a, b) => (b.monthlyAmount || 0) - (a.monthlyAmount || 0));

  const canSumRecurring =
    recurringMerchants.length > 0 &&
    currencies.size === 1 &&
    recurringMerchants.every((m) => m.monthlyAmount !== null);

  const totalMonthlyRecurring = canSumRecurring
    ? recurringMerchants.reduce((sum, m) => sum + (m.monthlyAmount || 0), 0)
    : null;

  const dates = facts.filter((f) => f.dateValue).map((f) => f.dateValue!).sort();

  return {
    recurringMerchantCount: recurringMerchants.length,
    recurringMerchants,
    totalMonthlyRecurring,
    recurringCurrency: recurringMerchants[0]?.currency || null,
    canSumRecurring,
    totalTransactions: facts.length,
    totalOutflows: outflows.length,
    dateRange: dates.length > 0 ? { start: dates[0], end: dates[dates.length - 1] } : null,
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ScanPage({ params }: PageProps) {
  const { id } = await params;

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      facts: true,
      uploads: true,
      issues: {
        include: {
          evidence: {
            include: {
              fact: true,
            },
          },
        },
        orderBy: [{ severity: "asc" }, { confidence: "desc" }],
      },
    },
  });

  if (!scan) {
    notFound();
  }

  const warnings = scan.warnings as string[];

  const getStatusClass = (status: string) => {
    switch (status) {
      case "completed":
        return "status-completed";
      case "processing":
        return "status-processing";
      case "failed":
        return "status-failed";
      default:
        return "status-pending";
    }
  };

  const getConfidenceClass = (confidence: string | null) => {
    switch (confidence) {
      case "high":
        return "confidence-high";
      case "medium":
        return "confidence-medium";
      case "low":
        return "confidence-low";
      default:
        return "";
    }
  };

  // Sort issues by severity order
  const severityOrder = { high: 0, medium: 1, low: 2 };
  const sortedIssues = [...scan.issues].sort((a, b) => {
    const aSev = severityOrder[a.severity as keyof typeof severityOrder] ?? 3;
    const bSev = severityOrder[b.severity as keyof typeof severityOrder] ?? 3;
    if (aSev !== bSev) return aSev - bSev;
    return b.confidence - a.confidence;
  });

  // Detect scan mode from facts
  const factsWithDirection = scan.facts.filter(
    (f) => f.direction === "inflow" || f.direction === "outflow"
  );
  const scanMode = factsWithDirection.length / Math.max(scan.facts.length, 1) > 0.8
    ? "bank" as const
    : "billing" as const;

  // Compute bank insights if in bank mode
  const bankInsights = scanMode === "bank" ? computeBankInsights(scan.facts) : null;

  return (
    <div className="container">
      <div className="top-nav">
        <Link href="/" className="back-link">
          &larr; New Scan
        </Link>
        {scan.status === "completed" && (
          <a
            href={`/api/scan/${scan.id}/report.pdf`}
            className="download-pdf-btn"
            download
          >
            Download PDF
          </a>
        )}
      </div>

      <h1>{scanMode === "bank" ? "Bank & Card Transaction Chaos Scan" : "Revenue & Billing Chaos Scan"}</h1>

      <div className="card">
        <div className="meta-info">
          <div className="meta-item">
            <span className="meta-label">Scan ID</span>
            <span className="meta-value" style={{ fontFamily: "monospace", fontSize: "0.875rem" }}>
              {scan.id}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Status</span>
            <span className={`status-badge ${getStatusClass(scan.status)}`}>
              {scan.status}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Extraction Confidence</span>
            <span className={`confidence-badge ${getConfidenceClass(scan.extractionConfidence)}`}>
              {scan.extractionConfidence || "N/A"}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Created</span>
            <span className="meta-value">
              {new Date(scan.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Facts Extracted</span>
            <span className="meta-value">{scan.facts.length}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Issues Found</span>
            <span className="meta-value">{scan.issues.length}</span>
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="warning">
          <strong>Extraction Warnings:</strong>
          <ul>
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <ChaosReport
        issues={sortedIssues}
        executiveSummary={scan.executiveSummary}
        facts={scan.facts}
        scanMode={scanMode}
        bankInsights={bankInsights}
      />

      <FactsTable facts={scan.facts} />
    </div>
  );
}
