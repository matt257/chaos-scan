import { ProposedIssue, Severity } from "./types";

export interface PruneOptions {
  maxIssues: number;
  minEvidenceByType: Record<string, number>;
}

const DEFAULT_PRUNE_OPTIONS: PruneOptions = {
  maxIssues: 8,
  minEvidenceByType: {
    unpaid_invoice_aging: 1,
    recurring_payment_gap: 3,
    amount_drift: 4,
    duplicate_charge: 2,
  },
};

const SEVERITY_ORDER: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Sort issues by severity (high first), then confidence (desc), then impact (desc)
 */
function sortIssues(issues: ProposedIssue[]): ProposedIssue[] {
  return [...issues].sort((a, b) => {
    // Sort by severity first
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;

    // Then by confidence (descending)
    const confDiff = b.confidence - a.confidence;
    if (Math.abs(confDiff) > 0.01) return confDiff;

    // Then by impact (descending, treat null as 0)
    const aImpact = a.impactMin ?? 0;
    const bImpact = b.impactMin ?? 0;
    return bImpact - aImpact;
  });
}

/**
 * Remove issues with insufficient evidence based on detector type
 */
function filterLowEvidence(
  issues: ProposedIssue[],
  minEvidenceByType: Record<string, number>
): ProposedIssue[] {
  return issues.filter((issue) => {
    const minEvidence = minEvidenceByType[issue.issueType] ?? 1;
    return issue.evidenceFactIds.length >= minEvidence;
  });
}

/**
 * De-duplicate: keep only 1 issue per (entity, detector) combination
 * Keeps the first one after sorting (highest priority)
 */
function deduplicateByEntityAndDetector(issues: ProposedIssue[]): ProposedIssue[] {
  const seen = new Set<string>();
  const result: ProposedIssue[] = [];

  for (const issue of issues) {
    const key = `${issue.entityName ?? "_unknown_"}|${issue.issueType}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(issue);
    }
  }

  return result;
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
  droppedByCap: number;
  wasCapped: boolean;
}

/**
 * Apply strictness policy to prune and cap issues
 */
export function pruneIssues(
  issues: ProposedIssue[],
  options: Partial<PruneOptions> = {}
): PruneResult {
  const opts = { ...DEFAULT_PRUNE_OPTIONS, ...options };
  const totalBeforePrune = issues.length;

  // Step 1: Sort by priority
  let result = sortIssues(issues);

  // Step 2: Filter low-evidence issues
  const afterEvidenceFilter = filterLowEvidence(result, opts.minEvidenceByType);
  const droppedLowEvidence = result.length - afterEvidenceFilter.length;
  result = afterEvidenceFilter;

  // Step 3: De-duplicate by entity + detector
  const afterDedup = deduplicateByEntityAndDetector(result);
  const droppedDuplicates = result.length - afterDedup.length;
  result = afterDedup;

  // Step 4: Cap total issues
  const afterCap = capIssues(result, opts.maxIssues);
  const droppedByCap = result.length - afterCap.length;
  result = afterCap;

  return {
    issues: result,
    totalBeforePrune,
    droppedLowEvidence,
    droppedDuplicates,
    droppedByCap,
    wasCapped: droppedByCap > 0,
  };
}
