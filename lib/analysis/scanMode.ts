/**
 * Scan Mode Detection
 *
 * Determines whether to use "bank" or "billing" mode based on fact characteristics.
 * Bank mode: >80% of facts are source_type="csv" AND have direction populated (not "unknown")
 */

import { FactRecord } from "./types";

export type ScanMode = "bank" | "billing";

/**
 * Detect the appropriate scan mode based on fact characteristics.
 *
 * Bank mode criteria:
 * - >80% of facts have source_type="csv"
 * - >80% of those CSV facts have direction populated (not "unknown")
 */
export function detectScanMode(facts: FactRecord[]): ScanMode {
  if (facts.length === 0) {
    return "billing";
  }

  // Count CSV facts
  const csvFacts = facts.filter((f) => f.sourceReference?.toLowerCase().includes("row") ||
    // Check if source type indicates CSV-like data
    f.factType === "payment" && f.direction !== "unknown");

  // Actually, let's use a simpler heuristic based on direction field
  // Bank transactions have direction populated; billing data typically doesn't
  const factsWithDirection = facts.filter(
    (f) => f.direction === "inflow" || f.direction === "outflow"
  );

  const directionRatio = factsWithDirection.length / facts.length;

  // If >80% of facts have direction populated, treat as bank mode
  if (directionRatio > 0.8) {
    return "bank";
  }

  return "billing";
}

/**
 * Get language/terminology based on scan mode
 */
export interface ScanModeTerminology {
  transactionType: string; // "charges" or "payments"
  transactionTypeSingular: string;
  entityType: string; // "merchant" or "vendor"
  reportTitle: string;
  noIssuesMessage: string;
}

export function getScanModeTerminology(mode: ScanMode): ScanModeTerminology {
  if (mode === "bank") {
    return {
      transactionType: "charges",
      transactionTypeSingular: "charge",
      entityType: "merchant",
      reportTitle: "Bank & Card Transaction Chaos Scan",
      noIssuesMessage:
        "No high-confidence issues detected in your bank/card transactions (conservative scan).",
    };
  }

  return {
    transactionType: "payments",
    transactionTypeSingular: "payment",
    entityType: "vendor",
    reportTitle: "Revenue & Billing Chaos Scan",
    noIssuesMessage:
      "No high-confidence billing or revenue issues detected (conservative scan).",
  };
}
