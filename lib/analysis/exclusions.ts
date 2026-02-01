/**
 * Merchant Exclusion List
 *
 * Identifies non-merchant transactions that should be excluded from
 * certain detectors to avoid embarrassing false positives.
 *
 * These are typically:
 * - Person-to-person transfers
 * - Credit card payments
 * - Internal account transfers
 */

// Strong transfer keywords - these alone indicate a transfer
const STRONG_TRANSFER_KEYWORDS = [
  "ZELLE",
  "VENMO",
  "CASH APP",
  "CASHAPP",
  "PAYPAL TRANSFER",
  "APPLE CASH",
  "WIRE TRANSFER",
  "ACH TRANSFER",
  "INTERNAL TRANSFER",
  "EXTERNAL TRANSFER",
];

// Weak transfer patterns - need additional context to exclude
const WEAK_TRANSFER_PATTERNS = [
  "PAYMENT",
  "TRANSFER",
  "XFER",
  "ACH",
  "WIRE",
];

// Patterns that indicate this is a real merchant even if it contains weak patterns
const MERCHANT_INDICATORS = [
  "AMAZON",
  "NETFLIX",
  "SPOTIFY",
  "HULU",
  "DISNEY",
  "APPLE.COM",
  "GOOGLE",
  "UBER",
  "LYFT",
  "DOORDASH",
  "GRUBHUB",
  "STARBUCKS",
  "WALMART",
  "TARGET",
  "COSTCO",
  "CVS",
  "WALGREENS",
  "SHELL",
  "CHEVRON",
  "EXXON",
  "AT&T",
  "VERIZON",
  "T-MOBILE",
  "COMCAST",
  "SPECTRUM",
];

// Credit card payment patterns - strong indicators
const CARD_PAYMENT_PATTERNS = [
  "AUTOPAY",
  "AUTO PAY",
  "CARD PAYMENT",
  "ONLINE PAYMENT",
  "MINIMUM PAYMENT",
  "STATEMENT PAYMENT",
  "BILL PAY TO",
  "BILLPAY",
];

// Bank fee/service patterns
const BANK_SERVICE_PATTERNS = [
  "OVERDRAFT",
  "NSF FEE",
  "SERVICE CHARGE",
  "MONTHLY FEE",
  "INTEREST CHARGE",
  "FINANCE CHARGE",
  "MAINTENANCE FEE",
];

export interface ExclusionResult {
  isExcluded: boolean;
  reason: string | null;
  pattern: string | null;
}

/**
 * Check if an entity should be excluded, with detailed reason.
 */
export function checkExclusion(
  entityCanonical: string | null,
  entityRaw: string | null = null
): ExclusionResult {
  if (!entityCanonical) {
    return { isExcluded: false, reason: null, pattern: null };
  }

  const canonical = entityCanonical.toUpperCase();
  const raw = (entityRaw || "").toUpperCase();

  // Check if this looks like a real merchant (override exclusion)
  for (const indicator of MERCHANT_INDICATORS) {
    if (canonical.includes(indicator)) {
      return { isExcluded: false, reason: null, pattern: null };
    }
  }

  // Check strong transfer keywords - always exclude
  for (const keyword of STRONG_TRANSFER_KEYWORDS) {
    if (canonical.includes(keyword)) {
      return {
        isExcluded: true,
        reason: "P2P transfer service",
        pattern: keyword,
      };
    }
  }

  // Check card payment patterns - always exclude
  for (const pattern of CARD_PAYMENT_PATTERNS) {
    if (canonical.includes(pattern) || raw.includes(pattern)) {
      return {
        isExcluded: true,
        reason: "Credit card payment",
        pattern: pattern,
      };
    }
  }

  // Check bank service patterns - always exclude
  for (const pattern of BANK_SERVICE_PATTERNS) {
    if (canonical.includes(pattern)) {
      return {
        isExcluded: true,
        reason: "Bank fee/service",
        pattern: pattern,
      };
    }
  }

  // Check weak transfer patterns - only exclude if strongly indicative
  // Weak patterns need to be at the START or be the primary descriptor
  for (const pattern of WEAK_TRANSFER_PATTERNS) {
    // Only exclude if:
    // 1. The pattern is at the start (e.g., "PAYMENT TO JOHN")
    // 2. OR the entity is short and dominated by the pattern
    const isAtStart = canonical.startsWith(pattern);
    const isShortEntity = canonical.length < 20;
    const patternDominates = canonical.length <= pattern.length + 10;

    if (isAtStart && (isShortEntity || patternDominates)) {
      // If the entity IS essentially just the pattern itself, exclude it
      // Examples: "PAYMENT", "TRANSFER", "ACH WITHDRAWAL"
      // These are clearly not merchant names
      const isJustThePattern = canonical === pattern ||
        canonical.length <= pattern.length + 12; // Allow for suffixes like " WITHDRAWAL"

      if (isJustThePattern) {
        return {
          isExcluded: true,
          reason: "Transfer/payment",
          pattern: pattern,
        };
      }

      // For longer entities, check raw description for additional transfer context
      const hasTransferContext =
        raw.includes("TO ") ||
        raw.includes("FROM ") ||
        raw.includes("SEND") ||
        raw.includes("RECEIVED") ||
        /\d{4}$/.test(raw); // Ends with account digits

      if (hasTransferContext) {
        return {
          isExcluded: true,
          reason: "Transfer/payment",
          pattern: pattern,
        };
      }
    }
  }

  return { isExcluded: false, reason: null, pattern: null };
}

/**
 * Check if an entity represents a non-merchant transaction.
 * Simplified boolean wrapper for checkExclusion.
 */
export function isNonMerchantTransaction(
  entityCanonical: string | null,
  entityRaw: string | null = null
): boolean {
  return checkExclusion(entityCanonical, entityRaw).isExcluded;
}

/**
 * Get a list of all exclusion patterns (for transparency/debugging).
 */
export function getExclusionPatterns(): {
  strongTransfers: string[];
  weakTransfers: string[];
  cardPayments: string[];
  bankServices: string[];
  merchantIndicators: string[];
} {
  return {
    strongTransfers: [...STRONG_TRANSFER_KEYWORDS],
    weakTransfers: [...WEAK_TRANSFER_PATTERNS],
    cardPayments: [...CARD_PAYMENT_PATTERNS],
    bankServices: [...BANK_SERVICE_PATTERNS],
    merchantIndicators: [...MERCHANT_INDICATORS],
  };
}
