import { describe, it, expect } from "vitest";
import {
  normalizeBankCsv,
  isBankCsv,
  parseAmount,
  parseClearingStatus,
  parseDate,
} from "../bankCsv";

describe("parseAmount", () => {
  it("should parse simple positive amounts", () => {
    expect(parseAmount("100.00")).toEqual({ value: 100, isNegative: false });
    expect(parseAmount("1234.56")).toEqual({ value: 1234.56, isNegative: false });
    expect(parseAmount("0.99")).toEqual({ value: 0.99, isNegative: false });
  });

  it("should parse amounts with currency symbols", () => {
    expect(parseAmount("$100.00")).toEqual({ value: 100, isNegative: false });
    expect(parseAmount("€50.00")).toEqual({ value: 50, isNegative: false });
    expect(parseAmount("100.00 USD")).toEqual({ value: 100, isNegative: false });
  });

  it("should parse negative amounts with leading minus", () => {
    expect(parseAmount("-100.00")).toEqual({ value: 100, isNegative: true });
    expect(parseAmount("-$50.00")).toEqual({ value: 50, isNegative: true });
  });

  it("should parse negative amounts with parentheses (accounting format)", () => {
    expect(parseAmount("(100.00)")).toEqual({ value: 100, isNegative: true });
    expect(parseAmount("($1,234.56)")).toEqual({ value: 1234.56, isNegative: true });
  });

  it("should parse negative amounts with trailing minus", () => {
    expect(parseAmount("100.00-")).toEqual({ value: 100, isNegative: true });
    expect(parseAmount("1,234.56-")).toEqual({ value: 1234.56, isNegative: true });
  });

  it("should parse amounts with thousand separators (US format)", () => {
    expect(parseAmount("1,000.00")).toEqual({ value: 1000, isNegative: false });
    expect(parseAmount("1,234,567.89")).toEqual({ value: 1234567.89, isNegative: false });
  });

  it("should parse amounts in European format", () => {
    expect(parseAmount("1.234,56")).toEqual({ value: 1234.56, isNegative: false });
    expect(parseAmount("12.345,67")).toEqual({ value: 12345.67, isNegative: false });
  });

  it("should handle empty or invalid values", () => {
    expect(parseAmount("")).toEqual({ value: null, isNegative: false });
    expect(parseAmount("-")).toEqual({ value: null, isNegative: false });
    expect(parseAmount("   ")).toEqual({ value: null, isNegative: false });
    expect(parseAmount("N/A")).toEqual({ value: null, isNegative: false });
  });
});

describe("parseClearingStatus", () => {
  it("should detect cleared transactions", () => {
    expect(parseClearingStatus("Cleared")).toBe("cleared");
    expect(parseClearingStatus("POSTED")).toBe("cleared");
    expect(parseClearingStatus("Settled")).toBe("cleared");
    expect(parseClearingStatus("Complete")).toBe("cleared");
  });

  it("should detect pending transactions", () => {
    expect(parseClearingStatus("Pending")).toBe("pending");
    expect(parseClearingStatus("PROCESSING")).toBe("pending");
    expect(parseClearingStatus("Hold")).toBe("pending");
    expect(parseClearingStatus("Authorized")).toBe("pending");
  });

  it("should detect reversed transactions", () => {
    expect(parseClearingStatus("Reversed")).toBe("reversed");
    expect(parseClearingStatus("REFUND")).toBe("reversed");
    expect(parseClearingStatus("Canceled")).toBe("reversed");
    expect(parseClearingStatus("Void")).toBe("reversed");
  });

  it("should return unknown for unrecognized status", () => {
    expect(parseClearingStatus("Something")).toBe("unknown");
    expect(parseClearingStatus(null)).toBe("unknown");
    expect(parseClearingStatus("")).toBe("unknown");
  });
});

describe("parseDate", () => {
  it("should parse ISO format dates", () => {
    expect(parseDate("2024-01-15")).toBe("2024-01-15");
    expect(parseDate("2024-12-31")).toBe("2024-12-31");
  });

  it("should parse US format dates (MM/DD/YYYY)", () => {
    expect(parseDate("01/15/2024")).toBe("2024-01-15");
    expect(parseDate("12/31/2024")).toBe("2024-12-31");
    expect(parseDate("1/5/2024")).toBe("2024-01-05");
  });

  it("should parse dates with dashes (MM-DD-YYYY)", () => {
    expect(parseDate("01-15-2024")).toBe("2024-01-15");
  });

  it("should parse YYYY/MM/DD format", () => {
    expect(parseDate("2024/01/15")).toBe("2024-01-15");
  });

  it("should handle empty or invalid dates", () => {
    expect(parseDate("")).toBe(null);
    expect(parseDate(null)).toBe(null);
    expect(parseDate("   ")).toBe(null);
  });
});

describe("normalizeBankCsv", () => {
  it("should parse single-amount format CSV", () => {
    const csv = `Date,Description,Amount,Balance
01/15/2024,Deposit from payroll,1500.00,2500.00
01/16/2024,Grocery store,-75.50,2424.50
01/17/2024,Gas station,-45.00,2379.50`;

    const result = normalizeBankCsv(csv);

    expect(result.detectedFormat).toBe("single_amount");
    expect(result.transactions).toHaveLength(3);

    expect(result.transactions[0]).toMatchObject({
      date: "2024-01-15",
      description: "Deposit from payroll",
      amount: 1500,
      direction: "inflow",
      balance: 2500,
    });

    expect(result.transactions[1]).toMatchObject({
      date: "2024-01-16",
      description: "Grocery store",
      amount: 75.5,
      direction: "outflow",
    });
  });

  it("should parse debit/credit format CSV", () => {
    const csv = `Transaction Date,Description,Debit,Credit,Balance
2024-01-15,Payroll deposit,,1500.00,2500.00
2024-01-16,Grocery store,75.50,,2424.50
2024-01-17,Refund,,25.00,2449.50`;

    const result = normalizeBankCsv(csv);

    expect(result.detectedFormat).toBe("debit_credit");
    expect(result.transactions).toHaveLength(3);

    expect(result.transactions[0]).toMatchObject({
      date: "2024-01-15",
      description: "Payroll deposit",
      amount: 1500,
      direction: "inflow",
    });

    expect(result.transactions[1]).toMatchObject({
      date: "2024-01-16",
      description: "Grocery store",
      amount: 75.5,
      direction: "outflow",
    });

    expect(result.transactions[2]).toMatchObject({
      direction: "inflow",
      amount: 25,
    });
  });

  it("should handle quoted fields with commas", () => {
    const csv = `Date,Description,Amount
01/15/2024,"Acme Corp, Inc.",1500.00
01/16/2024,"Jones, Smith & Co.",-200.00`;

    const result = normalizeBankCsv(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].description).toBe("Acme Corp, Inc.");
    expect(result.transactions[1].description).toBe("Jones, Smith & Co.");
  });

  it("should detect status column", () => {
    const csv = `Date,Description,Amount,Status
01/15/2024,Deposit,1500.00,Cleared
01/16/2024,Pending charge,-50.00,Pending
01/17/2024,Reversed payment,-25.00,Reversed`;

    const result = normalizeBankCsv(csv);

    expect(result.transactions[0].clearingStatus).toBe("cleared");
    expect(result.transactions[1].clearingStatus).toBe("pending");
    expect(result.transactions[2].clearingStatus).toBe("reversed");
  });

  it("should handle empty CSV", () => {
    const result = normalizeBankCsv("");
    expect(result.transactions).toHaveLength(0);
    expect(result.warnings).toContain("CSV has no data rows");
  });

  it("should handle header-only CSV", () => {
    const csv = `Date,Description,Amount`;
    const result = normalizeBankCsv(csv);
    expect(result.transactions).toHaveLength(0);
    expect(result.warnings).toContain("CSV has no data rows");
  });

  it("should warn when format is unknown", () => {
    const csv = `Foo,Bar,Baz
a,b,c`;

    const result = normalizeBankCsv(csv);
    expect(result.detectedFormat).toBe("unknown");
    expect(result.warnings.some((w) => w.includes("Could not detect"))).toBe(true);
  });

  it("should handle money out/money in columns", () => {
    const csv = `Date,Payee,Money Out,Money In
01/15/2024,Vendor A,100.00,
01/16/2024,Customer B,,500.00`;

    const result = normalizeBankCsv(csv);

    expect(result.detectedFormat).toBe("debit_credit");
    expect(result.transactions[0].direction).toBe("outflow");
    expect(result.transactions[1].direction).toBe("inflow");
  });

  it("should preserve raw amount text", () => {
    const csv = `Date,Description,Amount
01/15/2024,Test,"($1,234.56)"`;

    const result = normalizeBankCsv(csv);
    expect(result.transactions[0].rawAmountText).toBe("($1,234.56)");
    expect(result.transactions[0].amount).toBe(1234.56);
    expect(result.transactions[0].direction).toBe("outflow");
  });

  it("should detect reference column", () => {
    const csv = `Date,Description,Amount,Reference
01/15/2024,Check payment,-500.00,CHK12345`;

    const result = normalizeBankCsv(csv);
    expect(result.transactions[0].reference).toBe("CHK12345");
  });
});

describe("isBankCsv", () => {
  it("should return true for bank-like CSV", () => {
    const csv = `Date,Description,Amount,Balance
01/15/2024,Test,100.00,100.00`;

    expect(isBankCsv(csv)).toBe(true);
  });

  it("should return true for debit/credit CSV", () => {
    const csv = `Transaction Date,Memo,Debit,Credit
01/15/2024,Test,100.00,`;

    expect(isBankCsv(csv)).toBe(true);
  });

  it("should return false for non-bank CSV", () => {
    const csv = `Name,Email,Phone
John,john@example.com,555-1234`;

    expect(isBankCsv(csv)).toBe(false);
  });

  it("should return false for empty CSV", () => {
    expect(isBankCsv("")).toBe(false);
  });

  it("should detect bank keywords even without amount columns", () => {
    const csv = `Date,Transaction Details,Balance
01/15/2024,Deposit,1000.00`;

    expect(isBankCsv(csv)).toBe(true);
  });
});
