/**
 * Entity Canonicalization
 *
 * Normalizes merchant/entity names from bank transactions to improve
 * grouping and actionability. Uses deterministic rules to create
 * canonical names that group related transactions together.
 */

// Common business entity suffixes to remove
const ENTITY_SUFFIXES = [
  "INC",
  "INCORPORATED",
  "LLC",
  "LTD",
  "LIMITED",
  "CO",
  "CORP",
  "CORPORATION",
  "COMPANY",
  "THE",
  "NA",
  "LP",
  "LLP",
  "PC",
  "PLLC",
  "PA",
  "INTL",
  "INTERNATIONAL",
  "USA",
  "US",
];

// Words that should be removed when they appear at the end (often orphaned after number removal)
// Note: STORE is NOT included here since "Target Store" is a legitimate entity name
// The LOCATION_PATTERNS handle "STORE #1234" specifically
const TRAILING_NOISE_WORDS = [
  "LOC",
  "BRANCH",
  "LOCATION",
];

// Transaction metadata tokens to remove
const TRANSACTION_TOKENS = [
  "POS",
  "DEBIT",
  "CREDIT",
  "ACH",
  "ONLINE",
  "PURCHASE",
  "PAYMENT",
  "TRANSFER",
  "ATM",
  "CARD",
  "CHECK",
  "CHK",
  "REF",
  "VISA",
  "MASTERCARD",
  "MC",
  "AMEX",
  "DISCOVER",
  "CHECKCARD",
  "RECURRING",
  "AUTOPAY",
  "BILLPAY",
  "WIRE",
  "MOBILE",
  "WEB",
  "WITHDRAWAL",
  "DEPOSIT",
  "DIRECT",
  "DEP",
  "WD",
  "DR",
  "CR",
  "DDA",
  "MEMO",
  "EFT",
  "ELECTRONIC",
  "PREAUTHORIZED",
  "PREAUTH",
  "AUTH",
  "AUTHORIZED",
  "PENDING",
  "POSTED",
  "CLEARED",
  "TRANSACTION",
  "TXN",
  "EXTERNAL",
  "INTERNAL",
  "SQ",           // Square
  "PP",           // PayPal
  "TST",          // Test
  "ORIG",
  "ORIGINATOR",
];

// Payment services that should only be removed when followed by something else
// (they can be the merchant themselves)
const PAYMENT_SERVICE_PREFIXES = [
  "PAYPAL",
  "VENMO",
  "ZELLE",
];

// Location/branch identifiers that add noise
const LOCATION_PATTERNS = [
  /\bSTORE\s*#\d+/gi,            // Store references with # and number
  /\bSTORE\s+\d+/gi,             // Store references with space and number
  /\bLOC\s*#?\d+/gi,             // Location references with number
  /\bBRANCH\s*#?\d+/gi,          // Branch references with number
  /\bLOCATION\s*#?\d+/gi,        // Location references with number
  /\b#\d+\b/g,                    // Hash followed by numbers anywhere
  /\*\d+/g,                       // Star followed by numbers (e.g., "*1234")
  /\b[A-Z]{2}\s+\d{4,}/g,        // State code + number (e.g., "CA 12345")
  /\b\d{5,}\b/g,                  // Long numeric IDs (5+ digits)
  /\b\d{3,4}$/,                   // Trailing 3-4 digit numbers
];

// Date patterns in descriptions (applied BEFORE punctuation removal)
const EARLY_DATE_PATTERNS = [
  /\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/g,  // MM/DD or MM/DD/YYYY with slash/dash
  /\b\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\b/g,         // YYYY/MM/DD or YYYY-MM-DD
];

// Date patterns in descriptions (applied AFTER punctuation removal)
const DATE_PATTERNS = [
  /\b\d{6,8}\b/g,                            // Compact dates like 20240115
  /\b0[1-9]\d{2}\b/g,                        // Date fragments like 0415 (MMDD starting with 0)
  /\b1[0-2]\d{2}\b/g,                        // Date fragments like 1215 (MMDD for Oct-Dec)
  /\b\d{1,2}\s+\d{1,2}\b(?!\s+\d)/g,        // Space-separated date like "01 15"
];

/**
 * Canonicalize an entity name using deterministic rules.
 *
 * Rules applied in order:
 * 1. Uppercase and trim
 * 2. Collapse multiple spaces
 * 3. Remove punctuation (except internal letters/numbers)
 * 4. Remove isolated single letters (artifacts from punctuation removal)
 * 5. Remove transaction metadata tokens
 * 6. Remove payment service prefixes (only when followed by something else)
 * 7. Remove common business suffixes
 * 8. Remove location patterns and trailing numeric IDs
 * 9. Remove date patterns
 * 10. Remove trailing noise words (STORE, BRANCH, etc.)
 * 11. Remove location suffixes (city names, state codes)
 * 12. Final cleanup
 */
export function canonicalizeEntity(raw: string | null): string | null {
  if (!raw || raw.trim() === "") {
    return null;
  }

  let result = raw;

  // Step 1: Uppercase and trim
  result = result.toUpperCase().trim();

  // Step 2: Collapse multiple spaces
  result = result.replace(/\s+/g, " ");

  // Step 2b: Remove date patterns BEFORE punctuation removal (while slashes intact)
  for (const pattern of EARLY_DATE_PATTERNS) {
    result = result.replace(pattern, " ");
  }
  result = result.replace(/\s+/g, " ").trim();

  // Step 3: Remove punctuation and special characters
  // First, handle possessive 'S specially - merge it with preceding word
  result = result.replace(/'S\b/g, "S");  // McDonald'S -> McDonaldS
  // Then remove other punctuation
  // This converts "AT&T" to "AT T" (keeping the space for & characters)
  result = result
    .replace(/[^\w\s]/g, " ")             // Remove all non-word characters except spaces
    .replace(/\s+/g, " ")                 // Collapse spaces again
    .trim();

  // Step 5: Remove transaction metadata tokens
  // First, remove compound phrases like "BILL PAY" before single tokens
  result = result.replace(/\bBILL\s+PAY\b/gi, " ");
  result = result.replace(/\s+/g, " ").trim();

  for (const token of TRANSACTION_TOKENS) {
    // Match token as whole word
    const regex = new RegExp(`\\b${token}\\b`, "gi");
    result = result.replace(regex, " ");
  }
  result = result.replace(/\s+/g, " ").trim();

  // Step 6: Remove payment service prefixes only when followed by something else
  for (const service of PAYMENT_SERVICE_PREFIXES) {
    // Only remove if there's content after it
    const prefixRegex = new RegExp(`^${service}\\s+(?=\\S)`, "gi");
    result = result.replace(prefixRegex, "");
  }
  result = result.replace(/\s+/g, " ").trim();

  // Step 7: Remove common business suffixes (at end or before other suffixes)
  for (const suffix of ENTITY_SUFFIXES) {
    // Match suffix at word boundary at end
    const endRegex = new RegExp(`\\b${suffix}\\s*$`, "gi");
    result = result.replace(endRegex, "");

    // Also match suffix followed by other suffixes
    const midRegex = new RegExp(`\\b${suffix}\\b(?=\\s+(${ENTITY_SUFFIXES.join("|")})\\b)`, "gi");
    result = result.replace(midRegex, "");
  }
  result = result.replace(/\s+/g, " ").trim();

  // Step 8: Remove location patterns and trailing numeric IDs
  for (const pattern of LOCATION_PATTERNS) {
    result = result.replace(pattern, " ");
  }
  result = result.replace(/\s+/g, " ").trim();

  // Step 9: Remove date patterns
  for (const pattern of DATE_PATTERNS) {
    result = result.replace(pattern, " ");
  }
  result = result.replace(/\s+/g, " ").trim();

  // Step 10: Remove trailing noise words (orphaned after number removal)
  for (const word of TRAILING_NOISE_WORDS) {
    const trailingRegex = new RegExp(`\\b${word}\\s*$`, "gi");
    result = result.replace(trailingRegex, "");
  }
  result = result.replace(/\s+/g, " ").trim();

  // Step 11: Remove common location suffixes (city + state code patterns)
  // This handles patterns like "ANYTOWN CA" at the end
  // Only remove if there's substantial content before it AND the city name looks like a city (5+ chars)
  const stateCodes = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
  const words = result.split(" ");
  if (words.length > 2) {
    const lastWord = words[words.length - 1];
    const secondLastWord = words[words.length - 2];
    // Only remove "CITY STATE" if:
    // - Last word is a state code
    // - Second last word looks like a city name (5+ characters, not a common word)
    if (lastWord && stateCodes.includes(lastWord) &&
        secondLastWord && secondLastWord.length >= 5) {
      // Remove both city and state
      result = words.slice(0, -2).join(" ");
    }
  }
  result = result.replace(/\s+/g, " ").trim();

  // Step 12: Remove leading/trailing non-alphanumeric characters
  result = result.replace(/^[^A-Z0-9]+/, "").replace(/[^A-Z0-9]+$/, "");

  // Step 13: Remove common prefixes that add noise
  result = result.replace(/^(THE|A|AN)\s+/i, "");

  // Final cleanup
  result = result.replace(/\s+/g, " ").trim();

  // If nothing left or just numbers, return null
  if (result === "" || result.length < 2 || /^\d+$/.test(result)) {
    return null;
  }

  return result;
}

/**
 * Extract a display-friendly entity name from the canonical form.
 * Applies title case to the canonical name.
 */
export function formatEntityForDisplay(canonical: string | null): string | null {
  if (!canonical) return null;

  // Convert to title case
  return canonical
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
