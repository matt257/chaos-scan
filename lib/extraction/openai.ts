import OpenAI from "openai";
import { ExtractionResult, Fact, SourceType } from "@/lib/types";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "./prompt";
import { v4 as uuidv4 } from "uuid";
import { isBankCsv, normalizeBankCsv, BankTransaction } from "../ingestion/bankCsv";
import { canonicalizeEntity } from "../normalize/canonicalizeEntity";

const MOCK_EXTRACTION: ExtractionResult = {
  facts: [
    {
      fact_id: "fact_001",
      fact_type: "invoice",
      entity_name: "Acme Corp",
      entity_raw: "Acme Corp",
      entity_canonical: "ACME",
      amount: { value: 1500.0, currency: "USD" },
      date: { value: "2024-01-15", date_type: "issued" },
      status: "unpaid",
      recurrence: "one_time",
      source_type: "csv",
      source_reference: "Row 1",
      confidence: 0.95,
      notes: null,
      direction: "unknown",
      clearing_status: "unknown",
      raw_amount_text: null,
    },
    {
      fact_id: "fact_002",
      fact_type: "payment",
      entity_name: "TechStart Inc",
      entity_raw: "TechStart Inc",
      entity_canonical: "TECHSTART",
      amount: { value: 2500.0, currency: "USD" },
      date: { value: "2024-01-10", date_type: "paid" },
      status: "paid",
      recurrence: "monthly",
      source_type: "csv",
      source_reference: "Row 2",
      confidence: 0.9,
      notes: null,
      direction: "outflow",
      clearing_status: "cleared",
      raw_amount_text: null,
    },
    {
      fact_id: "fact_003",
      fact_type: "subscription",
      entity_name: "CloudService Pro",
      entity_raw: "CloudService Pro",
      entity_canonical: "CLOUDSERVICE PRO",
      amount: { value: 99.99, currency: "USD" },
      date: { value: "2024-02-01", date_type: "started" },
      status: "active",
      recurrence: "monthly",
      source_type: "csv",
      source_reference: "Row 3",
      confidence: 0.85,
      notes: "Annual billing available",
      direction: "unknown",
      clearing_status: "unknown",
      raw_amount_text: null,
    },
  ],
  warnings: ["Mock extraction - OPENAI_API_KEY not configured"],
  extraction_confidence: "high",
};

/**
 * Convert pre-parsed bank transactions to facts
 */
function bankTransactionsToFacts(
  transactions: BankTransaction[],
  sourceType: SourceType
): Fact[] {
  return transactions.map((tx) => ({
    fact_id: uuidv4(),
    fact_type: "bank_transaction" as const,
    entity_name: tx.entityCanonical || tx.entityRaw, // Use canonical as primary display name
    entity_raw: tx.entityRaw,
    entity_canonical: tx.entityCanonical,
    amount: { value: tx.amount, currency: null },
    date: { value: tx.date, date_type: "posted" as const },
    status: tx.clearingStatus === "reversed" ? "failed" as const : "paid" as const,
    recurrence: "one_time" as const,
    source_type: sourceType,
    source_reference: `Row ${tx.rowIndex}`,
    confidence: tx.amount !== null && tx.date !== null ? 0.95 : 0.7,
    notes: tx.reference ? `Ref: ${tx.reference}` : null,
    direction: tx.direction,
    clearing_status: tx.clearingStatus,
    raw_amount_text: tx.rawAmountText || null,
  }));
}

export async function extractFacts(
  content: string,
  sourceType: SourceType
): Promise<ExtractionResult> {
  // Check if this is a bank CSV that we can pre-process deterministically
  if (sourceType === "csv" && isBankCsv(content)) {
    return extractBankFacts(content, sourceType);
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === "sk-...") {
    console.log("OPENAI_API_KEY not configured, returning mock extraction");
    return {
      ...MOCK_EXTRACTION,
      facts: MOCK_EXTRACTION.facts.map((f) => ({
        ...f,
        fact_id: uuidv4(),
        source_type: sourceType,
      })),
    };
  }

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: EXTRACTION_USER_PROMPT(sourceType, content) },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      return {
        facts: [],
        warnings: ["Empty response from OpenAI"],
        extraction_confidence: "low",
      };
    }

    const parsed = JSON.parse(responseContent) as ExtractionResult;

    if (!parsed.facts || !Array.isArray(parsed.facts)) {
      return {
        facts: [],
        warnings: ["Invalid response structure from OpenAI"],
        extraction_confidence: "low",
      };
    }

    return {
      facts: parsed.facts.map((f: Fact) => {
        const entityRaw = f.entity_name;
        const entityCanonical = canonicalizeEntity(entityRaw);
        return {
          ...f,
          source_type: sourceType,
          entity_raw: entityRaw,
          entity_canonical: entityCanonical,
          // Ensure new fields have defaults if not provided by AI
          direction: f.direction || "unknown",
          clearing_status: f.clearing_status || "unknown",
          raw_amount_text: f.raw_amount_text || null,
        };
      }),
      warnings: parsed.warnings || [],
      extraction_confidence: parsed.extraction_confidence || "medium",
    };
  } catch (error) {
    console.error("OpenAI extraction error:", error);
    return {
      facts: [],
      warnings: [
        `Extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      ],
      extraction_confidence: "low",
    };
  }
}

/**
 * Extract facts from a bank CSV using deterministic parsing
 * Falls back to AI only for entity name enrichment
 */
async function extractBankFacts(
  content: string,
  sourceType: SourceType
): Promise<ExtractionResult> {
  const result = normalizeBankCsv(content);
  const facts = bankTransactionsToFacts(result.transactions, sourceType);

  const warnings = [...result.warnings];

  if (result.detectedFormat === "unknown") {
    warnings.push("Bank CSV format not fully recognized - some fields may be missing");
  }

  // Determine confidence based on parsing quality
  let confidence: "high" | "medium" | "low" = "high";
  if (result.warnings.length > 0) {
    confidence = "medium";
  }
  if (result.detectedFormat === "unknown") {
    confidence = "low";
  }

  return {
    facts,
    warnings,
    extraction_confidence: confidence,
  };
}
