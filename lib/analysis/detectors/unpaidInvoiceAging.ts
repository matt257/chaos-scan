import { FactRecord, ProposedIssue } from "../types";
import { calculateUnpaidInvoiceImpact, formatImpactRationale } from "../impact";
import { generateUnpaidInvoiceSummary } from "../evidenceSummary";

const DEFAULT_AGING_DAYS = 45;

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function detectUnpaidInvoiceAging(
  facts: FactRecord[],
  agingDays: number = DEFAULT_AGING_DAYS
): ProposedIssue[] {
  const today = new Date().toISOString().split("T")[0];
  const issues: ProposedIssue[] = [];

  // Find unpaid invoices
  const unpaidInvoices = facts.filter(
    (f) =>
      f.factType === "invoice" &&
      f.status === "unpaid" &&
      f.dateValue &&
      (f.dateType === "due" || f.dateType === "issued")
  );

  if (unpaidInvoices.length === 0) {
    return [];
  }

  // Group by canonical entity (falls back to entityName for non-bank transactions)
  const byEntity = new Map<string, FactRecord[]>();
  for (const inv of unpaidInvoices) {
    const key = inv.entityCanonical || inv.entityName || "_unknown_";
    if (!byEntity.has(key)) {
      byEntity.set(key, []);
    }
    byEntity.get(key)!.push(inv);
  }

  for (const [entity, invoices] of byEntity) {
    const aged = invoices.filter((inv) => {
      const days = daysBetween(inv.dateValue!, today);
      return days >= agingDays;
    });

    if (aged.length === 0) continue;

    // Calculate impact using strict rules
    const impact = calculateUnpaidInvoiceImpact(aged);

    const oldestDays = Math.max(
      ...aged.map((inv) => daysBetween(inv.dateValue!, today))
    );

    // Generate evidence summary
    const { summary: evidenceSummary, stats: evidenceStats } = generateUnpaidInvoiceSummary(aged, oldestDays);

    // Use the original entityName for display (not the canonical key)
    const displayName = entity === "_unknown_" ? null : (aged[0].entityName || entity);

    const rationale: string[] = [
      `${aged.length} unpaid invoice(s) older than ${agingDays} days`,
      `Oldest invoice is ${oldestDays} days past ${aged[0].dateType === "due" ? "due date" : "issue date"}`,
    ];

    const impactRationale = formatImpactRationale(impact);
    if (impactRationale) {
      rationale.push(impactRationale);
    }

    issues.push({
      issueType: "unpaid_invoice_aging",
      title: `Aging unpaid invoices for ${displayName || "unknown entity"}`,
      severity: oldestDays > 90 ? "high" : oldestDays > 60 ? "medium" : "low",
      confidence: Math.min(...aged.map((a) => a.confidence)),
      impactMin: impact.impactMin,
      impactMax: impact.impactMax,
      currency: impact.currency,
      rationale,
      evidenceFactIds: aged.map((a) => a.id),
      entityName: displayName,
      evidenceSummary,
      evidenceStats,
    });
  }

  return issues;
}
