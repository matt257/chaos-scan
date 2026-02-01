export { detectUnpaidInvoiceAging } from "./unpaidInvoiceAging";
export { detectRecurringPaymentGap } from "./recurringPaymentGap";
export { detectAmountDrift } from "./amountDrift";
export { detectDuplicateCharges } from "./duplicateCharges";

// Bank-specific detectors
export {
  detectNewRecurringCharge,
  detectPriceCreep,
  detectBankDuplicateCharges,
  detectUnusualSpike,
  generateBankInsights,
} from "./bank";
export type { BankInsights } from "./bank";
