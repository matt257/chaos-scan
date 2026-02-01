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

// Payment and transfer services (P2P, ACH, etc.)
const TRANSFER_PATTERNS = [
  "PAYMENT",
  "TRANSFER",
  "XFER",
  "ZELLE",
  "VENMO",
  "CASH APP",
  "CASHAPP",
  "ACH",
  "WIRE",
  "PAYPAL",
  "APPLE CASH",
];

// Credit card payment patterns
const CARD_PAYMENT_PATTERNS = [
  "AUTOPAY",
  "AUTO PAY",
  "CARD PAYMENT",
  "ONLINE PAYMENT",
  "CREDIT CARD",
  "MINIMUM PAYMENT",
  "STATEMENT PAYMENT",
  "EPAY",
  "BILL PAY",
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
];

/**
 * Check if an entity represents a non-merchant transaction.
 *
 * Non-merchant transactions should be excluded from:
 * - New recurring charge detection
 * - Price creep detection
 * - Unusual spike detection
 *
 * They should NOT be excluded from duplicate detection (legitimate concern).
 */
export function isNonMerchantTransaction(entityCanonical: string | null): boolean {
  if (!entityCanonical) {
    return false;
  }

  const normalized = entityCanonical.toUpperCase();

  // Check transfer patterns
  for (const pattern of TRANSFER_PATTERNS) {
    if (normalized.includes(pattern)) {
      return true;
    }
  }

  // Check card payment patterns
  for (const pattern of CARD_PAYMENT_PATTERNS) {
    if (normalized.includes(pattern)) {
      return true;
    }
  }

  // Check bank service patterns
  for (const pattern of BANK_SERVICE_PATTERNS) {
    if (normalized.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Get a list of all exclusion patterns (for transparency/debugging).
 */
export function getExclusionPatterns(): {
  transfers: string[];
  cardPayments: string[];
  bankServices: string[];
} {
  return {
    transfers: [...TRANSFER_PATTERNS],
    cardPayments: [...CARD_PAYMENT_PATTERNS],
    bankServices: [...BANK_SERVICE_PATTERNS],
  };
}
