/**
 * Duplicate Charge Detector (Bank Version)
 *
 * Detects potential duplicate charges on the same day for the same merchant.
 *
 * Rules:
 * - Same canonical merchant + same amount + same date
 * - outflow + cleared
 * - evidenceCount >= 2
 *
 * Note: This detector does NOT exclude transfers/payments - duplicates
 * are a legitimate concern for all transaction types.
 */

import { FactRecord, ProposedIssue, Severity } from "../../types";

const HIGH_AMOUNT_THRESHOLD = 100;
const MEDIUM_AMOUNT_THRESHOLD = 25;

function getEntityKey(fact: FactRecord): string {
  return fact.entityCanonical || fact.entityRaw || fact.entityName || "_unknown_";
}

export function detectBankDuplicateCharges(facts: FactRecord[]): ProposedIssue[] {
  const issues: ProposedIssue[] = [];

  // Filter to outflow + cleared with amounts and dates
  const qualifying = facts.filter(
    (f) =>
      f.direction === "outflow" &&
      f.clearingStatus === "cleared" &&
      f.dateValue &&
      f.amountValue !== null
  );

  if (qualifying.length < 2) {
    return [];
  }

  // Group by canonical entity + date + amount
  const groups = new Map<string, FactRecord[]>();
  for (const fact of qualifying) {
    const entityKey = getEntityKey(fact);
    const key = `${entityKey}|${fact.dateValue}|${fact.amountValue}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(fact);
  }

  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    const [entity, date] = key.split("|");
    const amount = Math.abs(group[0].amountValue!);
    const currency = group[0].amountCurrency;

    // Calculate impact (duplicate amount)
    const impact = amount * (group.length - 1); // Only count the extras

    // Determine severity based on amount
    let severity: Severity = "low";
    if (amount >= HIGH_AMOUNT_THRESHOLD) {
      severity = "medium";
    } else if (amount >= MEDIUM_AMOUNT_THRESHOLD) {
      severity = "low";
    }

    const displayName = entity === "_unknown_" ? null : (group[0].entityName || entity);

    const rationale: string[] = [
      `${group.length} identical charges on the same day`,
      `Date: ${date}`,
    ];

    if (currency) {
      rationale.push(`Amount: ${currency} ${amount.toFixed(2)} each`);
      rationale.push(`Potential overcharge: ${currency} ${impact.toFixed(2)}`);
    }

    // Lower confidence as this needs manual verification
    const confidence = Math.min(...group.map((f) => f.confidence)) * 0.75;

    issues.push({
      issueType: "duplicate_charge",
      title: `Possible duplicate charge: ${displayName || "unknown merchant"}`,
      severity,
      confidence,
      impactMin: impact,
      impactMax: impact,
      currency,
      rationale,
      evidenceFactIds: group.map((f) => f.id),
      entityName: displayName,
      evidenceSummary: `${group.length} charges of ${currency || ""} ${amount.toFixed(2)} on ${date}`,
      evidenceStats: {
        count: group.length,
        dateRange: { start: date, end: date },
        medianAmount: amount,
        currency,
        sourceReferences: group.map((f) => f.sourceReference),
      },
    });
  }

  return issues;
}
