import { SecCompanyFacts } from "../secFacts";

// Shaped like data.sec.gov/api/xbrl/companyfacts output for a June fiscal-year filer
// (values in USD, as filed). FY2025 = 2024-07-01..2025-06-30, Q1 FY2026 ends 2025-09-30.
const m = (x: number) => x * 1e6;
// Accession numbers of the example filings.
export const ACCN = {
  k24: "0000950170-24-087843",
  q125: "0000950170-24-118967",
  k25: "0000950170-25-100235",
  q126: "0001193125-25-256321",
};
const flow = (fy25: number, fy24: number, q1fy26: number, q1fy25: number) => [
  { start: "2023-07-01", end: "2024-06-30", val: m(fy24), form: "10-K", filed: "2024-07-30", fy: 2024, fp: "FY", accn: ACCN.k24 },
  { start: "2023-07-01", end: "2024-06-30", val: m(fy24), form: "10-K", filed: "2025-07-30", fy: 2025, fp: "FY", accn: ACCN.k25 },
  { start: "2024-07-01", end: "2024-09-30", val: m(q1fy25), form: "10-Q", filed: "2024-10-30", fy: 2025, fp: "Q1", accn: ACCN.q125 },
  { start: "2024-07-01", end: "2025-06-30", val: m(fy25), form: "10-K", filed: "2025-07-30", fy: 2025, fp: "FY", accn: ACCN.k25 },
  { start: "2025-07-01", end: "2025-09-30", val: m(q1fy26), form: "10-Q", filed: "2025-10-29", fy: 2026, fp: "Q1", accn: ACCN.q126 },
  { start: "2024-07-01", end: "2024-09-30", val: m(q1fy25), form: "10-Q", filed: "2025-10-29", fy: 2026, fp: "Q1", accn: ACCN.q126 },
];
const instant = (end: string, val: number, form = "10-Q", filed = "2025-10-29") =>
  ({ end, val: m(val), form, filed, accn: form === "10-K" ? ACCN.k25 : ACCN.q126 });

// Shaped like data.sec.gov/submissions output (only the fields the app reads).
export const secSubmissions = () => ({
  name: "Example Corp",
  sicDescription: "Services-Prepackaged Software",
  exchanges: ["Nasdaq"],
  filings: { recent: { accessionNumber: [ACCN.q126, ACCN.k25], primaryDocument: ["exm-20250930.htm", "exm-20250630.htm"] } },
});

export const secFacts = (): SecCompanyFacts => ({
  cik: 789019,
  entityName: "EXAMPLE CORP",
  facts: {
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: {
          shares: [
            { end: "2025-07-24", val: m(7434), form: "10-K", filed: "2025-07-30", accn: ACCN.k25 },
            { end: "2025-10-20", val: m(7433), form: "10-Q", filed: "2025-10-29", accn: ACCN.q126 },
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
      Assets: { units: { USD: [instant("2025-09-30", 563_000)] } },
      Liabilities: { units: { USD: [instant("2025-09-30", 200_000)] } },
      LiabilitiesAndStockholdersEquity: { units: { USD: [instant("2025-09-30", 563_000)] } },
      EarningsPerShareDiluted: {
        units: {
          "USD/shares": [
            { start: "2023-07-01", end: "2024-06-30", val: 11.8, form: "10-K", filed: "2024-07-30", accn: ACCN.k24 },
            { start: "2024-07-01", end: "2025-06-30", val: 13.7, form: "10-K", filed: "2025-07-30", accn: ACCN.k25 },
            { start: "2024-07-01", end: "2024-09-30", val: 3.3, form: "10-Q", filed: "2024-10-30", accn: ACCN.q125 },
            { start: "2025-07-01", end: "2025-09-30", val: 3.72, form: "10-Q", filed: "2025-10-29", accn: ACCN.q126 },
            { start: "2024-07-01", end: "2024-09-30", val: 3.3, form: "10-Q", filed: "2025-10-29", accn: ACCN.q126 },
          ],
        },
      },
      WeightedAverageNumberOfDilutedSharesOutstanding: {
        units: { shares: [{ start: "2025-07-01", end: "2025-09-30", val: m(7_466), form: "10-Q", filed: "2025-10-29", accn: ACCN.q126 }] },
      },
    },
  },
});
