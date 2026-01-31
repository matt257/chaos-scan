import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateScanPdf, ScanPdfData, PdfIssue, EvidenceFact } from "@/lib/report/pdf";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch scan with all related data
    const scan = await prisma.scan.findUnique({
      where: { id },
      include: {
        facts: true,
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
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Sort issues by severity
    const severityOrder = { high: 0, medium: 1, low: 2 };
    const sortedIssues = [...scan.issues].sort((a, b) => {
      const aSev = severityOrder[a.severity as keyof typeof severityOrder] ?? 3;
      const bSev = severityOrder[b.severity as keyof typeof severityOrder] ?? 3;
      if (aSev !== bSev) return aSev - bSev;
      return b.confidence - a.confidence;
    });

    // Transform issues to include evidence facts
    const pdfIssues: PdfIssue[] = sortedIssues.map((issue) => {
      const evidenceFacts: EvidenceFact[] = issue.evidence.map((e) => ({
        id: e.fact.id,
        entityName: e.fact.entityName,
        amountValue: e.fact.amountValue,
        amountCurrency: e.fact.amountCurrency,
        dateValue: e.fact.dateValue,
        status: e.fact.status,
        sourceReference: e.fact.sourceReference,
      }));

      return {
        id: issue.id,
        issueType: issue.issueType,
        title: issue.title,
        severity: issue.severity,
        confidence: issue.confidence,
        impactMin: issue.impactMin,
        impactMax: issue.impactMax,
        currency: issue.currency,
        rationaleJson: issue.rationaleJson,
        entityName: issue.entityName,
        evidenceFacts,
      };
    });

    // Build PDF data
    const pdfData: ScanPdfData = {
      scanId: scan.id,
      createdAt: scan.createdAt,
      extractionConfidence: scan.extractionConfidence,
      issues: pdfIssues,
      facts: scan.facts.map((f) => ({
        id: f.id,
        factType: f.factType,
        status: f.status,
      })),
      executiveSummary: scan.executiveSummary,
      // Check if capped (issues.length >= 8 suggests capping may have occurred)
      wasCapped: scan.issues.length >= 8,
      maxIssues: 8,
    };

    // Generate PDF
    const pdfBuffer = await generateScanPdf(pdfData);

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(pdfBuffer);

    // Return PDF response
    return new NextResponse(uint8Array, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="chaos-scan-${scan.id.substring(0, 8)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
