import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runAnalysis } from "@/lib/analysis/runAnalysis";
import { FactRecord } from "@/lib/analysis/types";
import {
  DEMO_FACTS,
  DEMO_RAW_TEXT,
  DEMO_EXECUTIVE_SUMMARY,
} from "@/lib/demo/demoData";

export async function POST() {
  try {
    // Create scan record
    const scan = await prisma.scan.create({
      data: {
        status: "processing",
        warnings: [],
      },
    });

    // Create demo upload
    await prisma.upload.create({
      data: {
        scanId: scan.id,
        filename: "spark-agency-financials.csv",
        mimeType: "text/csv",
        sourceType: "csv",
        rawText: DEMO_RAW_TEXT,
      },
    });

    // Save demo facts to database
    const savedFactIds: Map<string, string> = new Map();

    for (const fact of DEMO_FACTS) {
      const savedFact = await prisma.fact.create({
        data: {
          scanId: scan.id,
          factId: fact.factId,
          factType: fact.factType,
          entityName: fact.entityName,
          amountValue: fact.amountValue,
          amountCurrency: fact.amountCurrency,
          dateValue: fact.dateValue,
          dateType: fact.dateType,
          status: fact.status,
          recurrence: fact.recurrence,
          sourceType: "csv",
          sourceReference: fact.sourceReference,
          confidence: fact.confidence,
          notes: fact.notes,
        },
      });
      savedFactIds.set(fact.factId, savedFact.id);
    }

    // Fetch saved facts for analysis
    const savedFacts = await prisma.fact.findMany({
      where: { scanId: scan.id },
    });

    // Convert to FactRecord format for analysis
    const factRecords: FactRecord[] = savedFacts.map((f) => ({
      id: f.id,
      factType: f.factType,
      entityName: f.entityName,
      amountValue: f.amountValue,
      amountCurrency: f.amountCurrency,
      dateValue: f.dateValue,
      dateType: f.dateType,
      status: f.status,
      recurrence: f.recurrence,
      sourceReference: f.sourceReference,
      confidence: f.confidence,
    }));

    // Run analysis with pruning (same as regular scan)
    const analysisResult = runAnalysis(factRecords);

    // Save issues and evidence
    for (const issue of analysisResult.issues) {
      // Build rationaleJson with evidence summary and stats
      const rationaleJson = JSON.parse(JSON.stringify({
        rationale: issue.rationale,
        evidenceSummary: issue.evidenceSummary,
        evidenceStats: issue.evidenceStats,
      }));

      const savedIssue = await prisma.issue.create({
        data: {
          scanId: scan.id,
          issueType: issue.issueType,
          title: issue.title,
          severity: issue.severity,
          confidence: issue.confidence,
          impactMin: issue.impactMin,
          impactMax: issue.impactMax,
          currency: issue.currency,
          rationaleJson,
          entityName: issue.entityName,
        },
      });

      // Create evidence links
      for (const factId of issue.evidenceFactIds) {
        await prisma.issueEvidence.create({
          data: {
            issueId: savedIssue.id,
            factId: factId,
          },
        });
      }
    }

    // Update scan with final status and pre-computed summary
    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: "completed",
        warnings: [],
        extractionConfidence: "high",
        executiveSummary: DEMO_EXECUTIVE_SUMMARY,
      },
    });

    return NextResponse.json({ scanId: scan.id });
  } catch (error) {
    console.error("Demo scan error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create demo scan" },
      { status: 500 }
    );
  }
}
