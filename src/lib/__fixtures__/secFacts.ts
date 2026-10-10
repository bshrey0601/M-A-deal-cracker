import { SecCompanyFacts } from "../secFacts";

// Shaped like data.sec.gov/api/xbrl/companyfacts output for a June fiscal-year filer
// (values in USD, as filed). FY2025 = 2024-07-01..2025-06-30, Q1 FY2026 ends 2025-09-30.
const m = (x: number) => x * 1e6;
const flow = (fy25: number, fy24: number, q1fy26: number, q1fy25: number) => [
  { start: "2023-07-01", end: "2024-06-30", val: m(fy24), form: "10-K", filed: "2024-07-30", fy: 2024, fp: "FY" },
  { start: "2023-07-01", end: "2024-06-30", val: m(fy24), form: "10-K", filed: "2025-07-30", fy: 2025, fp: "FY" },
  { start: "2024-07-01", end: "2024-09-30", val: m(q1fy25), form: "10-Q", filed: "2024-10-30", fy: 2025, fp: "Q1" },
  { start: "2024-07-01", end: "2025-06-30", val: m(fy25), form: "10-K", filed: "2025-07-30", fy: 2025, fp: "FY" },
  { start: "2025-07-01", end: "2025-09-30", val: m(q1fy26), form: "10-Q", filed: "2025-10-29", fy: 2026, fp: "Q1" },
  { start: "2024-07-01", end: "2024-09-30", val: m(q1fy25), form: "10-Q", filed: "2025-10-29", fy: 2026, fp: "Q1" },
];
const instant = (end: string, val: number, form = "10-Q", filed = "2025-10-29") => ({ end, val: m(val), form, filed });

export const secFacts = (): SecCompanyFacts => ({
  cik: 789019,
  entityName: "EXAMPLE CORP",
  facts: {
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: {
          shares: [
            { end: "2025-07-24", val: m(7434), form: "10-K", filed: "2025-07-30" },
            { end: "2025-10-20", val: m(7433), form: "10-Q", filed: "2025-10-29" },
          ],
        },
      },
    },
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: flow(280_000, 245_000, 77_000, 65_600) } },
      OperatingIncomeLoss: { units: { USD: flow(128_000, 109_400, 38_000, 30_500) } },
      NetIncomeLoss: { units: { USD: flow(101_800, 88_100, 27_700, 24_700) } },
      DepreciationDepletionAndAmortization: { units: { USD: flow(34_000, 22_300, 9_000, 7_000) } },
      PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: flow(64_500, 44_500, 19_400, 14_900) } },
      CashAndCashEquivalentsAtCarryingValue: {
        units: { USD: [instant("2025-06-30", 30_000, "10-K", "2025-07-30"), instant("2025-09-30", 28_800)] },
      },
      ShortTermInvestments: { units: { USD: [instant("2025-09-30", 73_000)] } },
      LongTermDebt: { units: { USD: [instant("2025-06-30", 43_000, "10-K", "2025-07-30")] } },
      LongTermDebtNoncurrent: { units: { USD: [instant("2025-09-30", 40_000)] } },
      LongTermDebtCurrent: { units: { USD: [instant("2025-09-30", 2_900)] } },
      StockholdersEquity: { units: { USD: [instant("2025-09-30", 363_000)] } },
    },
  },
});
