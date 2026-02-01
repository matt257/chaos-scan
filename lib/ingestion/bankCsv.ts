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
const DATE_PATTERNS = [
  /^date$/i,
  /^trans(action)?[\s_-]?date$/i,
  /^posted?[\s_-]?date$/i,
  /^value[\s_-]?date$/i,
  /^effective[\s_-]?date$/i,
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

/**
 * Parse date from various formats
 */
export function parseDate(text: string | null): string | null {
  if (!text || text.trim() === "") return null;

  const cleaned = text.trim();

  // Try ISO format first
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const usMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (usMatch) {
    const month = usMatch[1].padStart(2, "0");
    const day = usMatch[2].padStart(2, "0");
    return `${usMatch[3]}-${month}-${day}`;
  }

  // DD/MM/YYYY (European) - harder to distinguish, assume US for now
  // YYYY/MM/DD
  const altMatch = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (altMatch) {
    const month = altMatch[2].padStart(2, "0");
    const day = altMatch[3].padStart(2, "0");
    return `${altMatch[1]}-${month}-${day}`;
  }

  return null;
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
