import { ProposedIssue, Severity } from "./types";

export interface PruneOptions {
  maxIssues: number;                          // default 8
  maxPerEntity: number;                       // default 2
  allowLowSeverity: boolean;                  // default true, but only if room
  minEvidenceByType: Record<string, number>;  // e.g. { amount_drift: 4, recurring_payment_gap: 3 }
}

const DEFAULT_PRUNE_OPTIONS: PruneOptions = {
  maxIssues: 8,
  maxPerEntity: 2,
  allowLowSeverity: true,
  minEvidenceByType: {
    unpaid_invoice_aging: 1,
    recurring_payment_gap: 3,
    amount_drift: 4,
    duplicate_charge: 2,
    // Bank-specific detectors
    new_recurring_charge: 3,
    price_creep: 4,
    unusual_spike: 6,
  },
};

// Bank mode uses tighter per-entity caps to reduce noise
export const BANK_MODE_PRUNE_OPTIONS: Partial<PruneOptions> = {
  maxIssues: 8,
  maxPerEntity: 1, // Tighter cap for bank mode
  allowLowSeverity: true, // Will be adjusted dynamically based on issue count
  minEvidenceByType: {
    unpaid_invoice_aging: 1,
    recurring_payment_gap: 3,
    amount_drift: 4,
    duplicate_charge: 2,
    new_recurring_charge: 3,
    price_creep: 4,
    unusual_spike: 6,
  },
};

const SEVERITY_WEIGHT: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Calculate a deterministic score for an issue.
 *
 * Scoring formula:
 *   score = severityWeight*10 + confidence*5 + impactScore + evidenceCount*0.2
 *
 * - Severity: high=3, medium=2, low=1 (×10)
 * - Confidence: 0-1 multiplied by 5
 * - Impact: log-scaled to prevent huge impacts from dominating
 * - Evidence: small bonus for more supporting facts
 */
function calculateScore(issue: ProposedIssue): number {
  const severityScore = SEVERITY_WEIGHT[issue.severity] * 10;
  const confidenceScore = issue.confidence * 5;

  // Impact score: use log scale to prevent huge values from dominating
  // Prefer impactMin (conservative), fallback to impactMax, then 0
  const impact = issue.impactMin ?? issue.impactMax ?? 0;
  const impactScore = impact > 0 ? Math.log10(impact + 1) : 0;

  // Evidence bonus: small bonus for more evidence
  const evidenceScore = issue.evidenceFactIds.length * 0.2;

  return severityScore + confidenceScore + impactScore + evidenceScore;
}

/**
 * Sort issues by score (descending)
 */
function sortIssuesByScore(issues: ProposedIssue[]): ProposedIssue[] {
  return [...issues].sort((a, b) => calculateScore(b) - calculateScore(a));
}

/**
 * Remove issues with insufficient evidence based on detector type (hard gate)
 */
function filterLowEvidence(
  issues: ProposedIssue[],
  minEvidenceByType: Record<string, number>
): ProposedIssue[] {
  return issues.filter((issue) => {
    const minEvidence = minEvidenceByType[issue.issueType] ?? 1;
    const evidenceFactCount = issue.evidenceFactIds.length;
    const hasMinimumEvidence = evidenceFactCount >= minEvidence;
    return hasMinimumEvidence;
  });
}

/**
 * De-duplicate: keep only 1 issue per (entity, detector) combination.
 * Keeps the highest scored one (assumes issues are pre-sorted by score).
 */
function deduplicateByEntityAndDetector(issues: ProposedIssue[]): ProposedIssue[] {
  const seen = new Set<string>();
  const result: ProposedIssue[] = [];

  for (const issue of issues) {
    const entityKey = issue.entityName ?? "_unknown_";
    const detectorKey = issue.issueType;
    const key = `${entityKey}|${detectorKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(issue);
    }
  }

  return result;
}

/**
 * Cap total issues per entity to maxPerEntity.
 * Keeps the highest scored issues per entity (assumes issues are pre-sorted by score).
 */
function capPerEntity(issues: ProposedIssue[], maxPerEntity: number): ProposedIssue[] {
  const countByEntity = new Map<string, number>();
  const result: ProposedIssue[] = [];

  for (const issue of issues) {
    const entityKey = issue.entityName ?? "_unknown_";
    const currentCount = countByEntity.get(entityKey) ?? 0;

    if (currentCount < maxPerEntity) {
      result.push(issue);
      countByEntity.set(entityKey, currentCount + 1);
    }
  }

  return result;
}

/**
 * Filter out low severity issues if allowLowSeverity is false,
 * or keep them only if there's room (under maxIssues)
 */
function filterLowSeverityIfNeeded(
  issues: ProposedIssue[],
  allowLowSeverity: boolean,
  maxIssues: number
): ProposedIssue[] {
  if (allowLowSeverity) {
    return issues;
  }

  // If not allowing low severity, filter them out unless we need them to fill quota
  const nonLow = issues.filter((i) => i.severity !== "low");

  // If we have enough non-low issues, use only those
  if (nonLow.length >= maxIssues) {
    return nonLow;
  }

  // Otherwise, allow low severity issues to fill remaining slots
  return issues;
}

/**
 * Cap the number of issues
 */
function capIssues(issues: ProposedIssue[], maxIssues: number): ProposedIssue[] {
  return issues.slice(0, maxIssues);
}

export interface PruneResult {
  issues: ProposedIssue[];
  totalBeforePrune: number;
  droppedLowEvidence: number;
  droppedDuplicates: number;
  droppedPerEntityCap: number;
  droppedLowSeverity: number;
  droppedByCap: number;
  wasCapped: boolean;
}

/**
 * Apply strictness policy to prune and cap issues.
 *
 * Pipeline:
 * 1. Sort by score (severity*10 + confidence*5 + log(impact) + evidence*0.2)
 * 2. Filter low-evidence issues (hard gate)
 * 3. De-duplicate by (entity, detector) - keep highest scored
 * 4. Cap per entity to maxPerEntity (default 2)
 * 5. Filter low severity if needed (based on allowLowSeverity)
 * 6. Cap total to maxIssues (default 8)
 */
export function pruneIssues(
  issues: ProposedIssue[],
  options: Partial<PruneOptions> = {}
): PruneResult {
  const opts = { ...DEFAULT_PRUNE_OPTIONS, ...options };
  const totalBeforePrune = issues.length;

  // Step 1: Sort by score (descending)
  let result = sortIssuesByScore(issues);

  // Step 2: Filter low-evidence issues (hard gate)
  const afterEvidenceFilter = filterLowEvidence(result, opts.minEvidenceByType);
  const droppedLowEvidence = result.length - afterEvidenceFilter.length;
  result = afterEvidenceFilter;

  // Step 3: De-duplicate by (entity, detector) - keep highest scored
  const afterDedup = deduplicateByEntityAndDetector(result);
  const droppedDuplicates = result.length - afterDedup.length;
  result = afterDedup;

  // Step 4: Cap per entity to maxPerEntity
  const afterEntityCap = capPerEntity(result, opts.maxPerEntity);
  const droppedPerEntityCap = result.length - afterEntityCap.length;
  result = afterEntityCap;

  // Step 5: Filter low severity if needed
  const afterLowSeverityFilter = filterLowSeverityIfNeeded(
    result,
    opts.allowLowSeverity,
    opts.maxIssues
  );
  const droppedLowSeverity = result.length - afterLowSeverityFilter.length;
  result = afterLowSeverityFilter;

  // Step 6: Cap total issues
  const afterCap = capIssues(result, opts.maxIssues);
  const droppedByCap = result.length - afterCap.length;
  result = afterCap;

  return {
    issues: result,
    totalBeforePrune,
    droppedLowEvidence,
    droppedDuplicates,
    droppedPerEntityCap,
    droppedLowSeverity,
    droppedByCap,
    wasCapped: droppedByCap > 0 || droppedPerEntityCap > 0,
  };
}
