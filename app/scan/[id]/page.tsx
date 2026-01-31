import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";

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

  const formatAmount = (value: number | null, currency: string | null) => {
    if (value === null) return "-";
    const curr = currency || "USD";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr,
    }).format(value);
  };

  return (
    <div className="container">
      <Link href="/" className="back-link">
        &larr; New Scan
      </Link>

      <h1>Scan Results</h1>

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
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="warning">
          <strong>Warnings:</strong>
          <ul>
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Extracted Facts</h2>

        {scan.facts.length === 0 ? (
          <div className="empty-state">
            <p>No facts were extracted with sufficient confidence.</p>
            <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
              Facts with confidence below 0.6 are discarded.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Entity</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Recurrence</th>
                  <th>Source</th>
                  <th>Confidence</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {scan.facts.map((fact) => (
                  <tr key={fact.id}>
                    <td>
                      <span
                        style={{
                          background: "#f0f0f0",
                          padding: "0.125rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                        }}
                      >
                        {fact.factType}
                      </span>
                    </td>
                    <td>{fact.entityName || "-"}</td>
                    <td>{formatAmount(fact.amountValue, fact.amountCurrency)}</td>
                    <td>
                      {fact.dateValue ? (
                        <>
                          {fact.dateValue}
                          <br />
                          <span style={{ fontSize: "0.75rem", color: "#666" }}>
                            ({fact.dateType})
                          </span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{fact.status}</td>
                    <td>{fact.recurrence}</td>
                    <td>
                      <span style={{ fontSize: "0.75rem" }}>
                        {fact.sourceType}
                        {fact.sourceReference && (
                          <>
                            <br />
                            <span style={{ color: "#666" }}>{fact.sourceReference}</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`confidence-badge ${
                          fact.confidence >= 0.8
                            ? "confidence-high"
                            : fact.confidence >= 0.6
                            ? "confidence-medium"
                            : "confidence-low"
                        }`}
                      >
                        {(fact.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ maxWidth: "150px", fontSize: "0.75rem" }}>
                      {fact.notes || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
