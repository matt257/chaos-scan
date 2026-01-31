import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { extractFacts } from "@/lib/extraction/openai";
import { normalizeAndFilter } from "@/lib/normalize/normalizeFacts";
import { SourceType } from "@/lib/types";
import { runAnalysis } from "@/lib/analysis/runAnalysis";
import { generateSummary } from "@/lib/analysis/summarize";
import { FactRecord } from "@/lib/analysis/types";

function parseCSV(content: string): string {
  const lines = content.trim().split("\n");
  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const text = formData.get("text") as string | null;

    if (!file && !text?.trim()) {
      return NextResponse.json(
        { error: "Please provide a CSV file or text input" },
        { status: 400 }
      );
    }

    // Create scan record
    const scan = await prisma.scan.create({
      data: {
        status: "processing",
        warnings: [],
      },
    });

    const uploads: { sourceType: SourceType; content: string; filename?: string }[] = [];
    const allWarnings: string[] = [];
    const savedFactIds: string[] = [];

    // Process CSV file
    if (file) {
      const fileContent = await file.text();
      const parsedContent = parseCSV(fileContent);

      await prisma.upload.create({
        data: {
          scanId: scan.id,
          filename: file.name,
          mimeType: file.type || "text/csv",
          sourceType: "csv",
          rawText: parsedContent,
        },
      });

      uploads.push({
        sourceType: "csv",
        content: parsedContent,
        filename: file.name,
      });
    }

    // Process pasted text
    if (text?.trim()) {
      await prisma.upload.create({
        data: {
          scanId: scan.id,
          filename: null,
          mimeType: "text/plain",
          sourceType: "text",
          rawText: text.trim(),
        },
      });

      uploads.push({
        sourceType: "text",
        content: text.trim(),
      });
    }

    // Extract facts from all uploads
    let extractionConfidence: "high" | "medium" | "low" = "high";

    for (const upload of uploads) {
      const result = await extractFacts(upload.content, upload.sourceType);

      // Collect warnings
      allWarnings.push(...result.warnings);

      // Track lowest confidence
      if (result.extraction_confidence === "low") {
        extractionConfidence = "low";
      } else if (result.extraction_confidence === "medium" && extractionConfidence !== "low") {
        extractionConfidence = "medium";
      }

      // Normalize and filter facts
      const normalizedFacts = normalizeAndFilter(result.facts, 0.6);

      // Save facts to database
      for (const fact of normalizedFacts) {
        const savedFact = await prisma.fact.create({
          data: {
            scanId: scan.id,
            factId: fact.fact_id,
            factType: fact.fact_type,
            entityName: fact.entity_name,
            amountValue: fact.amount.value,
            amountCurrency: fact.amount.currency,
            dateValue: fact.date.value,
            dateType: fact.date.date_type,
            status: fact.status,
            recurrence: fact.recurrence,
            sourceType: fact.source_type,
            sourceReference: fact.source_reference,
            confidence: fact.confidence,
            notes: fact.notes,
          },
        });
        savedFactIds.push(savedFact.id);
      }
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

    // Run analysis with pruning
    const analysisResult = runAnalysis(factRecords);

    // Generate summary with prune stats
    const summary = await generateSummary(analysisResult.issues, analysisResult.pruneStats);

    // Save issues and evidence
    for (const issue of analysisResult.issues) {
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
          rationaleJson: issue.rationale,
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

    // Update scan with final status
    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: "completed",
        warnings: allWarnings,
        extractionConfidence,
        executiveSummary: summary.executiveSummary,
      },
    });

    return NextResponse.json({ scanId: scan.id });
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
