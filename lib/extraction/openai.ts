import OpenAI from "openai";
import { ExtractionResult, Fact, SourceType } from "@/lib/types";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "./prompt";
import { v4 as uuidv4 } from "uuid";

const MOCK_EXTRACTION: ExtractionResult = {
  facts: [
    {
      fact_id: "fact_001",
      fact_type: "invoice",
      entity_name: "Acme Corp",
      amount: { value: 1500.0, currency: "USD" },
      date: { value: "2024-01-15", date_type: "issued" },
      status: "unpaid",
      recurrence: "one_time",
      source_type: "csv",
      source_reference: "Row 1",
      confidence: 0.95,
      notes: null,
    },
    {
      fact_id: "fact_002",
      fact_type: "payment",
      entity_name: "TechStart Inc",
      amount: { value: 2500.0, currency: "USD" },
      date: { value: "2024-01-10", date_type: "paid" },
      status: "paid",
      recurrence: "monthly",
      source_type: "csv",
      source_reference: "Row 2",
      confidence: 0.9,
      notes: null,
    },
    {
      fact_id: "fact_003",
      fact_type: "subscription",
      entity_name: "CloudService Pro",
      amount: { value: 99.99, currency: "USD" },
      date: { value: "2024-02-01", date_type: "started" },
      status: "active",
      recurrence: "monthly",
      source_type: "csv",
      source_reference: "Row 3",
      confidence: 0.85,
      notes: "Annual billing available",
    },
  ],
  warnings: ["Mock extraction - OPENAI_API_KEY not configured"],
  extraction_confidence: "high",
};

export async function extractFacts(
  content: string,
  sourceType: SourceType
): Promise<ExtractionResult> {
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
      facts: parsed.facts.map((f: Fact) => ({
        ...f,
        source_type: sourceType,
      })),
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
