/**
 * Demo dataset resembling a creative agency with:
 * - Multiple clients with retainers
 * - Some unpaid/aging invoices
 * - Payment gaps in recurring payments
 * - Amount drift for one client
 * - Potential duplicate charges
 */

export interface DemoFact {
  factId: string;
  factType: "invoice" | "payment" | "subscription";
  entityName: string;
  amountValue: number;
  amountCurrency: string;
  dateValue: string;
  dateType: string;
  status: string;
  recurrence: string;
  sourceReference: string;
  confidence: number;
  notes: string | null;
}

// Demo dataset representing "Spark Creative Agency"
export const DEMO_AGENCY_NAME = "Spark Creative Agency";

export const DEMO_RAW_TEXT = `SPARK CREATIVE AGENCY - FINANCIAL RECORDS Q3-Q4 2024

CLIENT RETAINERS & INVOICES
============================

ACME Corporation - Monthly Retainer ($8,500/mo)
- Jan 2024: Paid $8,500 on Jan 15
- Feb 2024: Paid $8,500 on Feb 14
- Mar 2024: Paid $8,500 on Mar 15
- Apr 2024: Paid $8,500 on Apr 12
- May 2024: MISSING - no payment received
- Jun 2024: MISSING - no payment received
- Jul 2024: Paid $8,500 on Jul 18

TechStart Inc - Monthly Retainer ($5,000/mo)
- Jan 2024: Paid $5,000 on Jan 10
- Feb 2024: Paid $5,000 on Feb 12
- Mar 2024: Paid $5,000 on Mar 8
- Apr 2024: Paid $5,000 on Apr 15
- May 2024: Paid $5,000 on May 10
- Jun 2024: Paid $5,000 on Jun 14
- Jul 2024: Paid $5,000 on Jul 12

GlobalBrands Ltd - Monthly Retainer (reduced from $12,000 to $8,000)
- Jan 2024: Paid $12,000 on Jan 20
- Feb 2024: Paid $12,000 on Feb 18
- Mar 2024: Paid $12,000 on Mar 22
- Apr 2024: Paid $12,000 on Apr 19
- May 2024: Paid $8,000 on May 20 (reduced scope)
- Jun 2024: Paid $8,000 on Jun 18
- Jul 2024: Paid $8,000 on Jul 22

OUTSTANDING INVOICES
====================
INV-2024-089: Riverside Hotels - $15,000 - Issued Oct 15, 2024 - UNPAID (78 days)
INV-2024-091: Metro Fitness - $7,500 - Issued Nov 1, 2024 - UNPAID (61 days)
INV-2024-095: Riverside Hotels - $12,000 - Issued Nov 20, 2024 - UNPAID (42 days)

PROJECT PAYMENTS
================
BlueSky Ventures - Website Redesign
- Deposit: $10,000 paid Sep 5, 2024
- Milestone 1: $10,000 paid Sep 5, 2024 (same day - verify not duplicate)
- Milestone 2: $15,000 paid Oct 20, 2024

ACTIVE SUBSCRIPTIONS
====================
- Adobe Creative Cloud: $599/mo (active)
- Figma Team: $45/mo (active)
- Slack Business+: $150/mo (active)
`;

export const DEMO_FACTS: DemoFact[] = [
  // ACME Corporation - Monthly Retainer with gap (May-Jun missing)
  {
    factId: "demo-acme-jan",
    factType: "payment",
    entityName: "ACME Corporation",
    amountValue: 8500,
    amountCurrency: "USD",
    dateValue: "2024-01-15",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:2",
    confidence: 0.95,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-acme-feb",
    factType: "payment",
    entityName: "ACME Corporation",
    amountValue: 8500,
    amountCurrency: "USD",
    dateValue: "2024-02-14",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:3",
    confidence: 0.95,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-acme-mar",
    factType: "payment",
    entityName: "ACME Corporation",
    amountValue: 8500,
    amountCurrency: "USD",
    dateValue: "2024-03-15",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:4",
    confidence: 0.95,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-acme-apr",
    factType: "payment",
    entityName: "ACME Corporation",
    amountValue: 8500,
    amountCurrency: "USD",
    dateValue: "2024-04-12",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:5",
    confidence: 0.95,
    notes: "Monthly retainer payment",
  },
  // May and Jun are MISSING - gap of ~90 days
  {
    factId: "demo-acme-jul",
    factType: "payment",
    entityName: "ACME Corporation",
    amountValue: 8500,
    amountCurrency: "USD",
    dateValue: "2024-07-18",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:6",
    confidence: 0.95,
    notes: "Monthly retainer payment - resumed after gap",
  },

  // TechStart Inc - Consistent monthly payments (no issues)
  {
    factId: "demo-techstart-jan",
    factType: "payment",
    entityName: "TechStart Inc",
    amountValue: 5000,
    amountCurrency: "USD",
    dateValue: "2024-01-10",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:10",
    confidence: 0.92,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-techstart-feb",
    factType: "payment",
    entityName: "TechStart Inc",
    amountValue: 5000,
    amountCurrency: "USD",
    dateValue: "2024-02-12",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:11",
    confidence: 0.92,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-techstart-mar",
    factType: "payment",
    entityName: "TechStart Inc",
    amountValue: 5000,
    amountCurrency: "USD",
    dateValue: "2024-03-08",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:12",
    confidence: 0.92,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-techstart-apr",
    factType: "payment",
    entityName: "TechStart Inc",
    amountValue: 5000,
    amountCurrency: "USD",
    dateValue: "2024-04-15",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:13",
    confidence: 0.92,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-techstart-may",
    factType: "payment",
    entityName: "TechStart Inc",
    amountValue: 5000,
    amountCurrency: "USD",
    dateValue: "2024-05-10",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:14",
    confidence: 0.92,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-techstart-jun",
    factType: "payment",
    entityName: "TechStart Inc",
    amountValue: 5000,
    amountCurrency: "USD",
    dateValue: "2024-06-14",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:15",
    confidence: 0.92,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-techstart-jul",
    factType: "payment",
    entityName: "TechStart Inc",
    amountValue: 5000,
    amountCurrency: "USD",
    dateValue: "2024-07-12",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:16",
    confidence: 0.92,
    notes: "Monthly retainer payment",
  },

  // GlobalBrands Ltd - Amount drift (reduced from $12,000 to $8,000)
  {
    factId: "demo-global-jan",
    factType: "payment",
    entityName: "GlobalBrands Ltd",
    amountValue: 12000,
    amountCurrency: "USD",
    dateValue: "2024-01-20",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:20",
    confidence: 0.94,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-global-feb",
    factType: "payment",
    entityName: "GlobalBrands Ltd",
    amountValue: 12000,
    amountCurrency: "USD",
    dateValue: "2024-02-18",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:21",
    confidence: 0.94,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-global-mar",
    factType: "payment",
    entityName: "GlobalBrands Ltd",
    amountValue: 12000,
    amountCurrency: "USD",
    dateValue: "2024-03-22",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:22",
    confidence: 0.94,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-global-apr",
    factType: "payment",
    entityName: "GlobalBrands Ltd",
    amountValue: 12000,
    amountCurrency: "USD",
    dateValue: "2024-04-19",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:23",
    confidence: 0.94,
    notes: "Monthly retainer payment",
  },
  {
    factId: "demo-global-may",
    factType: "payment",
    entityName: "GlobalBrands Ltd",
    amountValue: 8000,
    amountCurrency: "USD",
    dateValue: "2024-05-20",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:24",
    confidence: 0.94,
    notes: "Monthly retainer payment - reduced scope",
  },
  {
    factId: "demo-global-jun",
    factType: "payment",
    entityName: "GlobalBrands Ltd",
    amountValue: 8000,
    amountCurrency: "USD",
    dateValue: "2024-06-18",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:25",
    confidence: 0.94,
    notes: "Monthly retainer payment - reduced scope",
  },
  {
    factId: "demo-global-jul",
    factType: "payment",
    entityName: "GlobalBrands Ltd",
    amountValue: 8000,
    amountCurrency: "USD",
    dateValue: "2024-07-22",
    dateType: "paid",
    status: "paid",
    recurrence: "monthly",
    sourceReference: "retainers.csv:26",
    confidence: 0.94,
    notes: "Monthly retainer payment - reduced scope",
  },

  // Unpaid invoices - Aging issues
  {
    factId: "demo-inv-089",
    factType: "invoice",
    entityName: "Riverside Hotels",
    amountValue: 15000,
    amountCurrency: "USD",
    dateValue: "2024-10-15",
    dateType: "issued",
    status: "unpaid",
    recurrence: "one_time",
    sourceReference: "invoices.csv:89",
    confidence: 0.98,
    notes: "Brand refresh project - Phase 1",
  },
  {
    factId: "demo-inv-091",
    factType: "invoice",
    entityName: "Metro Fitness",
    amountValue: 7500,
    amountCurrency: "USD",
    dateValue: "2024-11-01",
    dateType: "issued",
    status: "unpaid",
    recurrence: "one_time",
    sourceReference: "invoices.csv:91",
    confidence: 0.97,
    notes: "Social media campaign Q4",
  },
  {
    factId: "demo-inv-095",
    factType: "invoice",
    entityName: "Riverside Hotels",
    amountValue: 12000,
    amountCurrency: "USD",
    dateValue: "2024-11-20",
    dateType: "issued",
    status: "unpaid",
    recurrence: "one_time",
    sourceReference: "invoices.csv:95",
    confidence: 0.98,
    notes: "Brand refresh project - Phase 2",
  },

  // BlueSky Ventures - Potential duplicate (same day, same amount)
  {
    factId: "demo-bluesky-deposit",
    factType: "payment",
    entityName: "BlueSky Ventures",
    amountValue: 10000,
    amountCurrency: "USD",
    dateValue: "2024-09-05",
    dateType: "paid",
    status: "paid",
    recurrence: "one_time",
    sourceReference: "projects.csv:45",
    confidence: 0.88,
    notes: "Website redesign - Deposit",
  },
  {
    factId: "demo-bluesky-milestone1",
    factType: "payment",
    entityName: "BlueSky Ventures",
    amountValue: 10000,
    amountCurrency: "USD",
    dateValue: "2024-09-05",
    dateType: "paid",
    status: "paid",
    recurrence: "one_time",
    sourceReference: "projects.csv:46",
    confidence: 0.88,
    notes: "Website redesign - Milestone 1",
  },
  {
    factId: "demo-bluesky-milestone2",
    factType: "payment",
    entityName: "BlueSky Ventures",
    amountValue: 15000,
    amountCurrency: "USD",
    dateValue: "2024-10-20",
    dateType: "paid",
    status: "paid",
    recurrence: "one_time",
    sourceReference: "projects.csv:47",
    confidence: 0.90,
    notes: "Website redesign - Milestone 2",
  },

  // Active subscriptions
  {
    factId: "demo-sub-adobe",
    factType: "subscription",
    entityName: "Adobe Creative Cloud",
    amountValue: 599,
    amountCurrency: "USD",
    dateValue: "2024-01-01",
    dateType: "started",
    status: "active",
    recurrence: "monthly",
    sourceReference: "subscriptions.csv:1",
    confidence: 0.96,
    notes: "Team license - 10 seats",
  },
  {
    factId: "demo-sub-figma",
    factType: "subscription",
    entityName: "Figma Team",
    amountValue: 45,
    amountCurrency: "USD",
    dateValue: "2024-01-01",
    dateType: "started",
    status: "active",
    recurrence: "monthly",
    sourceReference: "subscriptions.csv:2",
    confidence: 0.96,
    notes: "Professional plan",
  },
  {
    factId: "demo-sub-slack",
    factType: "subscription",
    entityName: "Slack Business+",
    amountValue: 150,
    amountCurrency: "USD",
    dateValue: "2024-01-01",
    dateType: "started",
    status: "active",
    recurrence: "monthly",
    sourceReference: "subscriptions.csv:3",
    confidence: 0.96,
    notes: "Team communication",
  },
];

// Pre-computed executive summary for demo
export const DEMO_EXECUTIVE_SUMMARY = `This scan identified 4 issues requiring attention for Spark Creative Agency. The most significant finding is $27,000 in aging unpaid invoices from Riverside Hotels and Metro Fitness, with the oldest invoice now 78 days past issue date. Additionally, ACME Corporation shows a 2-month payment gap in their monthly retainer (May-June 2024), representing approximately $17,000 in potentially missed revenue. GlobalBrands Ltd's retainer decreased 33% from $12,000 to $8,000/month starting May 2024. A possible duplicate charge of $10,000 was detected for BlueSky Ventures on September 5, 2024—recommend verification.`;
