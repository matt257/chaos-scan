import { FactRecord, ProposedIssue } from "../types";
import { calculateDuplicateImpact, formatImpactRationale } from "../impact";

export function detectDuplicateCharges(facts: FactRecord[]): ProposedIssue[] {
  const issues: ProposedIssue[] = [];

  // Find payments with amounts and dates
  const payments = facts.filter(
    (f) =>
      f.factType === "payment" &&
      f.dateValue &&
      f.amountValue !== null
  );

  if (payments.length < 2) {
    return [];
  }

  // Group by entity + date + amount
  const groups = new Map<string, FactRecord[]>();
  for (const payment of payments) {
    const key = `${payment.entityName || "_unknown_"}|${payment.dateValue}|${payment.amountValue}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(payment);
  }

  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    const [entity, date] = key.split("|");

    // Calculate impact using strict rules
    const impact = calculateDuplicateImpact(group);

    const rationale: string[] = [
      `${group.length} payments with identical amount on the same day`,
      `Entity: ${entity === "_unknown_" ? "Unknown" : entity}`,
      `Date: ${date}`,
    ];

    // Only show amount if we have it
    if (group[0].amountValue !== null) {
      const amountStr = group[0].amountCurrency
        ? `${group[0].amountCurrency} ${group[0].amountValue.toFixed(2)}`
        : `${group[0].amountValue.toFixed(2)}`;
      rationale.push(`Amount: ${amountStr} each`);
    }

    const impactRationale = formatImpactRationale(impact);
    if (impactRationale) {
      rationale.push(impactRationale);
    }

    issues.push({
      issueType: "duplicate_charge",
      title: `Possible duplicate charges for ${entity === "_unknown_" ? "unknown entity" : entity}`,
      severity: "low", // Always low severity as this needs manual verification
      confidence: Math.min(...group.map((p) => p.confidence)) * 0.8, // Reduce confidence
      impactMin: impact.impactMin,
      impactMax: impact.impactMax,
      currency: impact.currency,
      rationale,
      evidenceFactIds: group.map((p) => p.id),
      entityName: entity === "_unknown_" ? null : entity,
    });
  }

  return issues;
}
