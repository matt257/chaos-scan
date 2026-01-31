import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChaosReport } from "./ChaosReport";
import { FactsTable } from "./FactsTable";

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

  return (
    <div className="container">
      <Link href="/" className="back-link">
        &larr; New Scan
      </Link>

      <h1>Revenue & Billing Chaos Scan</h1>

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
      />

      <FactsTable facts={scan.facts} />
    </div>
  );
}
