import { describe, it, expect } from "vitest";
import { canonicalizeEntity, formatEntityForDisplay } from "../canonicalizeEntity";

describe("canonicalizeEntity", () => {
  describe("basic normalization", () => {
    it("should uppercase and trim", () => {
      expect(canonicalizeEntity("  Walmart  ")).toBe("WALMART");
      expect(canonicalizeEntity("amazon")).toBe("AMAZON");
    });

    it("should collapse multiple spaces", () => {
      expect(canonicalizeEntity("Target   Store")).toBe("TARGET STORE");
    });

    it("should return null for empty or whitespace", () => {
      expect(canonicalizeEntity("")).toBeNull();
      expect(canonicalizeEntity("   ")).toBeNull();
      expect(canonicalizeEntity(null)).toBeNull();
    });
  });

  describe("suffix removal", () => {
    it("should remove common business suffixes", () => {
      expect(canonicalizeEntity("Acme Corp")).toBe("ACME");
      expect(canonicalizeEntity("Acme Inc")).toBe("ACME");
      expect(canonicalizeEntity("Acme LLC")).toBe("ACME");
      expect(canonicalizeEntity("Acme Ltd")).toBe("ACME");
      expect(canonicalizeEntity("Acme Co")).toBe("ACME");
      expect(canonicalizeEntity("Acme Company")).toBe("ACME");
    });

    it("should remove multiple suffixes", () => {
      expect(canonicalizeEntity("Acme Corp Inc")).toBe("ACME");
      expect(canonicalizeEntity("The Acme Company LLC")).toBe("ACME");
    });

    it("should remove THE prefix", () => {
      expect(canonicalizeEntity("The Home Depot")).toBe("HOME DEPOT");
      expect(canonicalizeEntity("THE CHEESECAKE FACTORY")).toBe("CHEESECAKE FACTORY");
    });
  });

  describe("transaction token removal", () => {
    it("should remove POS/DEBIT/CREDIT markers", () => {
      expect(canonicalizeEntity("POS DEBIT WALMART")).toBe("WALMART");
      expect(canonicalizeEntity("CREDIT CARD PURCHASE AMAZON")).toBe("AMAZON");
      expect(canonicalizeEntity("CHECKCARD 0415 TARGET")).toBe("TARGET");
    });

    it("should remove ACH/WIRE markers", () => {
      expect(canonicalizeEntity("ACH DEBIT NETFLIX")).toBe("NETFLIX");
      expect(canonicalizeEntity("WIRE TRANSFER ACME")).toBe("ACME");
    });

    it("should remove payment network markers", () => {
      expect(canonicalizeEntity("VISA PURCHASE STARBUCKS")).toBe("STARBUCKS");
      expect(canonicalizeEntity("MASTERCARD DEBIT CHIPOTLE")).toBe("CHIPOTLE");
    });

    it("should remove online/mobile markers", () => {
      expect(canonicalizeEntity("ONLINE PURCHASE AMAZON")).toBe("AMAZON");
      expect(canonicalizeEntity("MOBILE PAYMENT VENMO")).toBe("VENMO");
    });

    it("should remove PAYPAL/VENMO/ZELLE but keep merchant", () => {
      expect(canonicalizeEntity("PAYPAL INST XFER")).toBe("INST XFER");
      expect(canonicalizeEntity("ZELLE PAYMENT JOHN DOE")).toBe("JOHN DOE");
    });
  });

  describe("numeric ID removal", () => {
    it("should remove trailing store numbers", () => {
      expect(canonicalizeEntity("WALMART 1234")).toBe("WALMART");
      expect(canonicalizeEntity("TARGET STORE #5678")).toBe("TARGET");
      expect(canonicalizeEntity("KROGER 0891234")).toBe("KROGER");
    });

    it("should remove hash-prefixed numbers", () => {
      expect(canonicalizeEntity("CVS PHARMACY #12345")).toBe("CVS PHARMACY");
      expect(canonicalizeEntity("WALGREENS #9876")).toBe("WALGREENS");
    });

    it("should remove trailing asterisk numbers", () => {
      expect(canonicalizeEntity("UBER *TRIP")).toBe("UBER TRIP");
      expect(canonicalizeEntity("LYFT *RIDE 12345")).toBe("LYFT RIDE");
    });

    it("should remove location/branch references", () => {
      expect(canonicalizeEntity("BANK OF AMERICA BRANCH 123")).toBe("BANK OF AMERICA");
      expect(canonicalizeEntity("CHASE LOC #456")).toBe("CHASE");
    });
  });

  describe("date removal", () => {
    it("should remove date fragments", () => {
      expect(canonicalizeEntity("SPOTIFY 01/15")).toBe("SPOTIFY");
      expect(canonicalizeEntity("NETFLIX 1/5")).toBe("NETFLIX");
    });
  });

  describe("punctuation handling", () => {
    it("should remove common punctuation", () => {
      expect(canonicalizeEntity("McDonald's")).toBe("MCDONALDS");
      expect(canonicalizeEntity("AT&T")).toBe("AT T");
      expect(canonicalizeEntity("(Walmart)")).toBe("WALMART");
    });
  });

  describe("real-world bank descriptions", () => {
    it("should normalize typical bank transaction descriptions", () => {
      // Retail
      expect(canonicalizeEntity("POS DEBIT VISA CHECKCARD 0415 WALMART STORE #1234 ANYTOWN CA")).toBe("WALMART");
      expect(canonicalizeEntity("CHECKCARD 0312 TARGET T-1234 SEATTLE WA")).toBe("TARGET T");

      // Online purchases
      expect(canonicalizeEntity("AMAZON.COM*1A2B3C4D AMZN.COM/BILL WA")).toBe("AMAZON COM 1A2B3C4D AMZN COM BILL WA");
      expect(canonicalizeEntity("AMZN Mktp US*RT1AB2CD3")).toBe("AMZN MKTP US RT1AB2CD3");

      // Subscriptions
      expect(canonicalizeEntity("RECURRING PAYMENT NETFLIX.COM")).toBe("NETFLIX COM");
      expect(canonicalizeEntity("AUTOPAY SPOTIFY USA")).toBe("SPOTIFY");

      // Food/Restaurant
      expect(canonicalizeEntity("SQ *STARBUCKS COFFEE")).toBe("STARBUCKS COFFEE");
      expect(canonicalizeEntity("TST* CHIPOTLE ONLINE")).toBe("CHIPOTLE");

      // Utilities/Services
      expect(canonicalizeEntity("ACH DEBIT COMCAST CABLE COMM")).toBe("COMCAST CABLE COMM");
      expect(canonicalizeEntity("ONLINE BILL PAY AT&T MOBILITY")).toBe("AT T MOBILITY");
    });

    it("should group related transactions together", () => {
      // All these should normalize to the same canonical form
      const walmartVariants = [
        "WALMART",
        "WALMART STORE #1234",
        "POS DEBIT WALMART",
        "CHECKCARD WALMART 5678",
        "WALMART INC",
      ];

      const canonicalForms = walmartVariants.map(canonicalizeEntity);
      expect(new Set(canonicalForms).size).toBe(1);
      expect(canonicalForms[0]).toBe("WALMART");
    });

    it("should preserve meaningful distinctions", () => {
      // These should NOT be grouped together
      expect(canonicalizeEntity("WALMART")).not.toBe(canonicalizeEntity("TARGET"));
      expect(canonicalizeEntity("AMAZON")).not.toBe(canonicalizeEntity("AMAZON PRIME"));
      expect(canonicalizeEntity("NETFLIX")).not.toBe(canonicalizeEntity("SPOTIFY"));
    });
  });

  describe("edge cases", () => {
    it("should handle very short names", () => {
      expect(canonicalizeEntity("A")).toBeNull(); // Too short
      expect(canonicalizeEntity("AT")).toBe("AT");
      expect(canonicalizeEntity("BP")).toBe("BP"); // Gas station
    });

    it("should handle only-numbers after cleanup", () => {
      expect(canonicalizeEntity("12345")).toBeNull();
      expect(canonicalizeEntity("POS DEBIT 12345")).toBeNull();
    });

    it("should handle unicode/special characters", () => {
      expect(canonicalizeEntity("CAFÉ COFFEE")).toBe("CAF COFFEE");
    });
  });
});

describe("formatEntityForDisplay", () => {
  it("should convert to title case", () => {
    expect(formatEntityForDisplay("WALMART")).toBe("Walmart");
    expect(formatEntityForDisplay("HOME DEPOT")).toBe("Home Depot");
    expect(formatEntityForDisplay("AMAZON PRIME")).toBe("Amazon Prime");
  });

  it("should handle null", () => {
    expect(formatEntityForDisplay(null)).toBeNull();
  });
});
