/**
 * Bank CSV Normalizer
 *
 * Deterministically normalizes bank transaction CSVs before AI extraction.
 * Handles common bank export formats and amount conventions.
 */

import { Direction, ClearingStatus } from "../types";
import { canonicalizeEntity } from "../normalize/canonicalizeEntity";

export interface BankTransaction {
  date: string | null;
  description: string | null;
  entityRaw: string | null;         // Original description/entity
  entityCanonical: string | null;   // Normalized entity for grouping
  amount: number | null;
  direction: Direction;
  clearingStatus: ClearingStatus;
  rawAmountText: string;
  balance: number | null;
  reference: string | null;
  rowIndex: number;
}

export interface BankCsvResult {
  transactions: BankTransaction[];
  detectedFormat: string;
  warnings: string[];
}

// Common column name patterns for bank CSVs
// Order matters: posting date preferred over transaction date
const DATE_PATTERNS = [
  /^posted?[\s_-]?date$/i,      // Prefer posting date
  /^posting[\s_-]?date$/i,
  /^post[\s_-]?date$/i,
  /^trans(action)?[\s_-]?date$/i,
  /^date$/i,
  /^value[\s_-]?date$/i,
  /^effective[\s_-]?date$/i,
  /^settlement[\s_-]?date$/i,
];

const DESCRIPTION_PATTERNS = [
  /^desc(ription)?$/i,
  /^memo$/i,
  /^narrative$/i,
  /^details?$/i,
  /^payee$/i,
  /^merchant$/i,
  /^trans(action)?[\s_-]?(desc|details?)$/i,
];

const AMOUNT_PATTERNS = [
  /^amount$/i,
  /^trans(action)?[\s_-]?amount$/i,
  /^value$/i,
];

const DEBIT_PATTERNS = [
  /^debit$/i,
  /^withdrawal$/i,
  /^money[\s_-]?out$/i,
  /^out$/i,
  /^debits?$/i,
];

const CREDIT_PATTERNS = [
  /^credit$/i,
  /^deposit$/i,
  /^money[\s_-]?in$/i,
  /^in$/i,
  /^credits?$/i,
];

const BALANCE_PATTERNS = [
  /^balance$/i,
  /^running[\s_-]?balance$/i,
  /^available[\s_-]?balance$/i,
];

const STATUS_PATTERNS = [
  /^status$/i,
  /^state$/i,
  /^cleared$/i,
  /^posted$/i,
];

const REFERENCE_PATTERNS = [
  /^ref(erence)?$/i,
  /^trans(action)?[\s_-]?(id|ref|num(ber)?)$/i,
  /^check[\s_-]?num(ber)?$/i,
];

function matchColumn(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    for (const pattern of patterns) {
      if (pattern.test(headers[i].trim())) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Parse amount text, handling various bank formats:
 * - Negative numbers: -100.00, (100.00), 100.00-
 * - Currency symbols: $100.00, 100.00 USD
 * - Thousand separators: 1,000.00 or 1.000,00
 */
export function parseAmount(text: string): { value: number | null; isNegative: boolean } {
  if (!text || text.trim() === "" || text.trim() === "-") {
    return { value: null, isNegative: false };
  }

  const original = text.trim();
  let cleaned = original;

  // Check for parentheses (accounting negative)
  const hasParens = /^\(.*\)$/.test(cleaned);
  if (hasParens) {
    cleaned = cleaned.slice(1, -1);
  }

  // Check for trailing minus
  const hasTrailingMinus = /^[\d.,\s]+\-$/.test(cleaned);
  if (hasTrailingMinus) {
    cleaned = cleaned.slice(0, -1);
  }

  // Check for leading minus
  const hasLeadingMinus = /^-/.test(cleaned);
  if (hasLeadingMinus) {
    cleaned = cleaned.slice(1);
  }

  // Remove currency symbols and letters
  cleaned = cleaned.replace(/[^\d.,\-\s]/g, "").trim();

  // Handle European format (1.234,56) vs US format (1,234.56)
  // If there's a comma after a dot, it's European
  const hasEuropeanFormat = /\d+\.\d{3},\d{2}$/.test(cleaned) || /^\d{1,3}(\.\d{3})*,\d{2}$/.test(cleaned);

  if (hasEuropeanFormat) {
    // Convert European to standard: 1.234,56 -> 1234.56
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // US format: remove commas
    cleaned = cleaned.replace(/,/g, "");
  }

  const value = parseFloat(cleaned);
  if (isNaN(value)) {
    return { value: null, isNegative: false };
  }

  const isNegative = hasParens || hasTrailingMinus || hasLeadingMinus;
  return { value: Math.abs(value), isNegative };
}

/**
 * Parse clearing status from text
 */
export function parseClearingStatus(text: string | null): ClearingStatus {
  if (!text) return "unknown";

  const lower = text.toLowerCase().trim();

  if (/cleared|posted|settled|complete/i.test(lower)) {
    return "cleared";
  }
  if (/pending|processing|hold|auth(orized)?/i.test(lower)) {
    return "pending";
  }
  if (/reversed?|refund|cancel|void/i.test(lower)) {
    return "reversed";
  }

  return "unknown";
}

// Month name mapping for text date parsing
const MONTH_NAMES: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

/**
 * Parse date from various formats.
 * Supports:
 * - ISO: YYYY-MM-DD, YYYY/MM/DD
 * - US: MM/DD/YYYY, M/D/YYYY, MM-DD-YYYY
 * - Text: Jan 2, 2025, 02-Jan-2025, January 2 2025
 * - With time: 2025-01-15 10:30:00, 01/15/2025 10:30 AM
 */
export function parseDate(text: string | null): string | null {
  if (!text || text.trim() === "") return null;

  // Remove time portion if present (keep date only)
  let cleaned = text.trim();

  // Remove common time patterns
  cleaned = cleaned.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i, "");
  cleaned = cleaned.replace(/T\d{2}:\d{2}:\d{2}.*$/, ""); // ISO time
  cleaned = cleaned.trim();

  // Try ISO format first: YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const month = isoMatch[2].padStart(2, "0");
    const day = isoMatch[3].padStart(2, "0");
    if (isValidDate(isoMatch[1], month, day)) {
      return `${isoMatch[1]}-${month}-${day}`;
    }
  }

  // YYYY/MM/DD
  const altIsoMatch = cleaned.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/);
  if (altIsoMatch) {
    const month = altIsoMatch[2].padStart(2, "0");
    const day = altIsoMatch[3].padStart(2, "0");
    if (isValidDate(altIsoMatch[1], month, day)) {
      return `${altIsoMatch[1]}-${month}-${day}`;
    }
  }

  // MM/DD/YYYY or MM-DD-YYYY (US format)
  const usMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (usMatch) {
    const month = usMatch[1].padStart(2, "0");
    const day = usMatch[2].padStart(2, "0");
    if (isValidDate(usMatch[3], month, day)) {
      return `${usMatch[3]}-${month}-${day}`;
    }
  }

  // MM/DD/YY (2-digit year, assume 2000s)
  const usShortMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (usShortMatch) {
    const month = usShortMatch[1].padStart(2, "0");
    const day = usShortMatch[2].padStart(2, "0");
    const year = parseInt(usShortMatch[3]) < 50 ? `20${usShortMatch[3]}` : `19${usShortMatch[3]}`;
    if (isValidDate(year, month, day)) {
      return `${year}-${month}-${day}`;
    }
  }

  // Text format: "Jan 2, 2025" or "Jan 2 2025" or "January 2, 2025"
  const textMatch1 = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (textMatch1) {
    const monthName = textMatch1[1].toLowerCase();
    const month = MONTH_NAMES[monthName];
    if (month) {
      const day = textMatch1[2].padStart(2, "0");
      if (isValidDate(textMatch1[3], month, day)) {
        return `${textMatch1[3]}-${month}-${day}`;
      }
    }
  }

  // Text format: "2 Jan 2025" or "02-Jan-2025" or "2-January-2025"
  const textMatch2 = cleaned.match(/^(\d{1,2})[\s\-]([A-Za-z]+)[\s\-](\d{4})$/);
  if (textMatch2) {
    const monthName = textMatch2[2].toLowerCase();
    const month = MONTH_NAMES[monthName];
    if (month) {
      const day = textMatch2[1].padStart(2, "0");
      if (isValidDate(textMatch2[3], month, day)) {
        return `${textMatch2[3]}-${month}-${day}`;
      }
    }
  }

  // Text format: "2025-Jan-02" or "2025/Jan/02"
  const textMatch3 = cleaned.match(/^(\d{4})[\s\-\/]([A-Za-z]+)[\s\-\/](\d{1,2})$/);
  if (textMatch3) {
    const monthName = textMatch3[2].toLowerCase();
    const month = MONTH_NAMES[monthName];
    if (month) {
      const day = textMatch3[3].padStart(2, "0");
      if (isValidDate(textMatch3[1], month, day)) {
        return `${textMatch3[1]}-${month}-${day}`;
      }
    }
  }

  // Try parsing with Date object as last resort (handles many edge cases)
  try {
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      // Sanity check: year should be reasonable (1990-2100)
      if (year >= 1990 && year <= 2100) {
        const month = String(parsed.getMonth() + 1).padStart(2, "0");
        const day = String(parsed.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    }
  } catch {
    // Date parsing failed, return null
  }

  return null;
}

/**
 * Validate date components
 */
function isValidDate(year: string, month: string, day: string): boolean {
  const y = parseInt(year);
  const m = parseInt(month);
  const d = parseInt(day);

  if (y < 1990 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;

  // Basic month/day validation
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m === 2 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) {
    if (d > 29) return false;
  } else if (d > daysInMonth[m - 1]) {
    return false;
  }

  return true;
}

/**
 * Detect the format of the bank CSV
 */
type BankFormat = "single_amount" | "debit_credit" | "unknown";

interface ColumnMapping {
  dateCol: number;
  descCol: number;
  amountCol: number;
  debitCol: number;
  creditCol: number;
  balanceCol: number;
  statusCol: number;
  refCol: number;
  format: BankFormat;
}

function detectFormat(headers: string[]): ColumnMapping {
  const dateCol = matchColumn(headers, DATE_PATTERNS);
  const descCol = matchColumn(headers, DESCRIPTION_PATTERNS);
  const amountCol = matchColumn(headers, AMOUNT_PATTERNS);
  const debitCol = matchColumn(headers, DEBIT_PATTERNS);
  const creditCol = matchColumn(headers, CREDIT_PATTERNS);
  const balanceCol = matchColumn(headers, BALANCE_PATTERNS);
  const statusCol = matchColumn(headers, STATUS_PATTERNS);
  const refCol = matchColumn(headers, REFERENCE_PATTERNS);

  let format: BankFormat = "unknown";

  if (debitCol >= 0 && creditCol >= 0) {
    format = "debit_credit";
  } else if (amountCol >= 0) {
    format = "single_amount";
  }

  return {
    dateCol,
    descCol,
    amountCol,
    debitCol,
    creditCol,
    balanceCol,
    statusCol,
    refCol,
    format,
  };
}

/**
 * Parse a CSV string into rows
 * Handles quoted fields with commas
 */
function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  const lines = csvText.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;

    const row: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        if (nextChar === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else if (char === "," && !inQuotes) {
        row.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Normalize a bank CSV into structured transactions
 */
export function normalizeBankCsv(csvText: string): BankCsvResult {
  const warnings: string[] = [];
  const transactions: BankTransaction[] = [];

  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return {
      transactions: [],
      detectedFormat: "unknown",
      warnings: ["CSV has no data rows"],
    };
  }

  const headers = rows[0];
  const mapping = detectFormat(headers);

  if (mapping.format === "unknown") {
    warnings.push("Could not detect bank CSV format - no amount or debit/credit columns found");
  }

  if (mapping.dateCol < 0) {
    warnings.push("No date column detected");
  }

  if (mapping.descCol < 0) {
    warnings.push("No description column detected");
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((cell) => !cell.trim())) continue; // Skip empty rows

    const dateText = mapping.dateCol >= 0 ? row[mapping.dateCol] : null;
    const descText = mapping.descCol >= 0 ? row[mapping.descCol] : null;
    const statusText = mapping.statusCol >= 0 ? row[mapping.statusCol] : null;
    const refText = mapping.refCol >= 0 ? row[mapping.refCol] : null;
    const balanceText = mapping.balanceCol >= 0 ? row[mapping.balanceCol] : null;

    let amount: number | null = null;
    let direction: Direction = "unknown";
    let rawAmountText = "";

    if (mapping.format === "debit_credit") {
      const debitText = mapping.debitCol >= 0 ? row[mapping.debitCol] : "";
      const creditText = mapping.creditCol >= 0 ? row[mapping.creditCol] : "";

      rawAmountText = debitText || creditText || "";

      const debitParsed = parseAmount(debitText);
      const creditParsed = parseAmount(creditText);

      if (debitParsed.value !== null && debitParsed.value > 0) {
        amount = debitParsed.value;
        direction = "outflow";
        rawAmountText = debitText;
      } else if (creditParsed.value !== null && creditParsed.value > 0) {
        amount = creditParsed.value;
        direction = "inflow";
        rawAmountText = creditText;
      }
    } else if (mapping.format === "single_amount") {
      const amountText = mapping.amountCol >= 0 ? row[mapping.amountCol] : "";
      rawAmountText = amountText;

      const parsed = parseAmount(amountText);
      if (parsed.value !== null) {
        amount = parsed.value;
        // Negative = outflow, positive = inflow
        direction = parsed.isNegative ? "outflow" : "inflow";
      }
    }

    const balanceParsed = parseAmount(balanceText || "");
    const entityRaw = descText?.trim() || null;
    const entityCanonical = canonicalizeEntity(entityRaw);

    transactions.push({
      date: parseDate(dateText),
      description: descText?.trim() || null,
      entityRaw,
      entityCanonical,
      amount,
      direction,
      clearingStatus: parseClearingStatus(statusText),
      rawAmountText,
      balance: balanceParsed.value,
      reference: refText?.trim() || null,
      rowIndex: i,
    });
  }

  return {
    transactions,
    detectedFormat: mapping.format,
    warnings,
  };
}

/**
 * Check if content looks like a bank transaction CSV
 */
export function isBankCsv(csvText: string): boolean {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return false;

  const headers = rows[0];
  const mapping = detectFormat(headers);

  // Must have date column and either amount or debit/credit columns
  const hasDateColumn = mapping.dateCol >= 0;
  const hasAmountColumns = mapping.format !== "unknown";

  // Check for typical bank keywords in headers
  const headerLine = headers.join(" ").toLowerCase();
  const hasBankKeywords =
    /balance|transaction|debit|credit|deposit|withdrawal|statement/i.test(headerLine);

  return hasDateColumn && (hasAmountColumns || hasBankKeywords);
}
