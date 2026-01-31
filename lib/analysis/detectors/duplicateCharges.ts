import { FactRecord, ProposedIssue } from "../types";

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

    const [entity, date, amount] = key.split("|");
    const amountNum = parseFloat(amount);
    const duplicatedAmount = amountNum * (group.length - 1);

    const rationale: string[] = [
      `${group.length} payments with identical amount on the same day`,
      `Entity: ${entity === "_unknown_" ? "Unknown" : entity}`,
      `Date: ${date}`,
      `Amount: ${group[0].amountCurrency || "USD"} ${amountNum.toFixed(2)} each`,
      `Potential overcharge: ${group[0].amountCurrency || "USD"} ${duplicatedAmount.toFixed(2)}`,
    ];

    issues.push({
      issueType: "duplicate_charge",
      title: `Possible duplicate charges for ${entity === "_unknown_" ? "unknown entity" : entity}`,
      severity: "low", // Always low severity as this needs manual verification
      confidence: Math.min(...group.map((p) => p.confidence)) * 0.8, // Reduce confidence
      impactMin: duplicatedAmount,
      impactMax: duplicatedAmount,
      currency: group[0].amountCurrency,
      rationale,
      evidenceFactIds: group.map((p) => p.id),
      entityName: entity === "_unknown_" ? null : entity,
    });
  }

  return issues;
}
