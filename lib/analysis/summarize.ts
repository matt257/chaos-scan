import OpenAI from "openai";
import { ProposedIssue } from "./types";
import { ScanMode } from "./scanMode";

export interface PruneStats {
  totalBeforePrune: number;
  droppedLowEvidence: number;
  droppedDuplicates: number;
  droppedPerEntityCap: number;
  droppedLowSeverity: number;
  droppedByCap: number;
  wasCapped: boolean;
  maxIssues: number;
}

export interface SummaryResult {
  executiveSummary: string;
  issueTitles: string[];
  capMessage: string | null;
}

export interface SummaryOptions {
  scanMode?: ScanMode;
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

function generateCapMessage(pruneStats: PruneStats | null): string | null {
  if (!pruneStats) return null;

  const parts: string[] = [];

  if (pruneStats.wasCapped) {
    parts.push(`Showing top ${pruneStats.maxIssues} issues (conservative cap)`);
  }

  if (pruneStats.droppedLowEvidence > 0) {
    parts.push(`${pruneStats.droppedLowEvidence} low-evidence issue(s) filtered`);
  }

  if (pruneStats.droppedDuplicates > 0) {
    parts.push(`${pruneStats.droppedDuplicates} duplicate(s) removed`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function generateDeterministicSummary(
  issues: ProposedIssue[],
  pruneStats: PruneStats | null,
  scanMode: ScanMode = "billing"
): SummaryResult {
  const capMessage = generateCapMessage(pruneStats);

  // Mode-specific terminology
  const terminology = scanMode === "bank"
    ? {
        domain: "bank/card transaction",
        issueType: "charge",
        noIssues: "No high-confidence issues were detected in your bank/card transactions. " +
          "The analysis applied conservative rules for recurring charges, price changes, " +
          "duplicates, and unusual amounts. This does not guarantee absence of issues—" +
          "only that none met the detection thresholds.",
      }
    : {
        domain: "billing/revenue",
        issueType: "billing/revenue issue",
        noIssues: "No high-confidence billing or revenue issues were detected in this scan. " +
          "The analysis applied conservative rules for invoice aging, payment gaps, " +
          "amount drift, and duplicate charges. This does not guarantee absence of issues—" +
          "only that none met the detection thresholds.",
      };

  if (issues.length === 0) {
    return {
      executiveSummary: terminology.noIssues,
      issueTitles: [],
      capMessage,
    };
  }

  const highCount = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;
  const lowCount = issues.filter((i) => i.severity === "low").length;

  // Calculate total impact range
  const issuesWithImpact = issues.filter((i) => i.impactMin !== null);
  let impactSummary = "";
  if (issuesWithImpact.length > 0) {
    const totalMin = issuesWithImpact.reduce((sum, i) => sum + (i.impactMin || 0), 0);
    const totalMax = issuesWithImpact.reduce((sum, i) => sum + (i.impactMax || 0), 0);
    const currency = issuesWithImpact[0].currency;
    if (totalMin === totalMax) {
      impactSummary = ` Estimated impact: ${formatCurrency(totalMin, currency)}.`;
    } else {
      impactSummary = ` Estimated impact range: ${formatCurrency(totalMin, currency)}–${formatCurrency(totalMax, currency)}.`;
    }
  }

  const severitySummary: string[] = [];
  if (highCount > 0) severitySummary.push(`${highCount} high-severity`);
  if (mediumCount > 0) severitySummary.push(`${mediumCount} medium-severity`);
  if (lowCount > 0) severitySummary.push(`${lowCount} low-severity`);

  const executiveSummary =
    `This scan identified ${issues.length} potential ${terminology.domain} issue(s): ` +
    `${severitySummary.join(", ")}.${impactSummary} ` +
    `These findings are based on pattern detection and require manual verification. ` +
    `No recommendations are provided—review the evidence and apply business judgment.`;

  const issueTitles = issues.slice(0, 3).map((i) => i.title);

  return { executiveSummary, issueTitles, capMessage };
}

const SUMMARY_PROMPT = `You are a financial audit assistant. Given a list of detected billing/revenue issues, write a brief executive summary paragraph (2-3 sentences max).

Rules:
- State only facts from the provided issues
- Do NOT make recommendations or give advice
- Do NOT infer anything not explicitly provided
- Keep it professional and neutral
- Mention the count and severity breakdown
- Mention estimated impact if provided

Issues:`;

export async function generateSummary(
  issues: ProposedIssue[],
  pruneStats: PruneStats | null = null,
  options: SummaryOptions = {}
): Promise<SummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const capMessage = generateCapMessage(pruneStats);
  const scanMode = options.scanMode || "billing";

  // Fallback to deterministic summary if no API key
  if (!apiKey || apiKey === "sk-...") {
    return generateDeterministicSummary(issues, pruneStats, scanMode);
  }

  // Also use deterministic for empty issues
  if (issues.length === 0) {
    return generateDeterministicSummary(issues, pruneStats, scanMode);
  }

  try {
    const openai = new OpenAI({ apiKey });

    const issueDescriptions = issues.map((issue, i) => {
      const impact =
        issue.impactMin !== null
          ? `Impact: ${formatCurrency(issue.impactMin, issue.currency)}`
          : "Impact: unknown";
      return `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.title} - ${impact}`;
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SUMMARY_PROMPT,
        },
        {
          role: "user",
          content: issueDescriptions.join("\n"),
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const aiSummary = response.choices[0]?.message?.content?.trim();

    if (!aiSummary) {
      return generateDeterministicSummary(issues, pruneStats);
    }

    return {
      executiveSummary: aiSummary,
      issueTitles: issues.slice(0, 3).map((i) => i.title),
      capMessage,
    };
  } catch (error) {
    console.error("AI summary generation failed, using fallback:", error);
    return generateDeterministicSummary(issues, pruneStats, scanMode);
  }
}
