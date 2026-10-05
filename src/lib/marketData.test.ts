import { test } from "node:test";
import assert from "node:assert/strict";
import { mapYahooToCompany } from "./marketData";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Shaped like yahoo-finance2 quoteSummary output (absolute units, decimal ratios).
const summary = (o: any = {}) => ({
  price: { regularMarketPrice: 200, currency: "USD", currencySymbol: "$", longName: "Example Corp", exchangeName: "NasdaqGS", marketCap: 3_000_000_000_000, regularMarketTime: 1_759_694_400, ...o.price },
  summaryDetail: { fiftyTwoWeekHigh: 260, fiftyTwoWeekLow: 165, trailingPE: 30, dividendRate: 1.04, ...o.summaryDetail },
  defaultKeyStatistics: { sharesOutstanding: 15_000_000_000, trailingEps: 6.5, bookValue: 4.5, priceToBook: 44, enterpriseToEbitda: 22, enterpriseToRevenue: 7.5, netIncomeToCommon: 100_000_000_000, lastFiscalYearEnd: 1_727_481_600, ...o.defaultKeyStatistics },
  financialData: { totalRevenue: 400_000_000_000, ebitda: 135_000_000_000, operatingMargins: 0.3, totalDebt: 100_000_000_000, totalCash: 60_000_000_000, revenueGrowth: 0.05, ebitdaMargins: 0.3375, profitMargins: 0.25, financialCurrency: "USD", ...o.financialData },
  assetProfile: { sector: "Technology", longBusinessSummary: "Example Corp designs phones. It also sells services." },
});

const annual = [
  { date: new Date("2023-09-30"), depreciationAndAmortization: 11_000_000_000, capitalExpenditure: -10_000_000_000 },
  { date: new Date("2024-09-28"), depreciationAndAmortization: 12_000_000_000, capitalExpenditure: -9_500_000_000 },
];

test("maps Yahoo fields into millions with correct derived values", () => {
  const c = mapYahooToCompany("EXM", { summary: summary(), annual });
  assert.equal(c.name, "Example Corp");
  assert.equal(c.currency, "$");
  close(c.currentPrice, 200);
  close(c.marketCap, 3_000_000);
  close(c.sharesOutstanding, 15_000);
  close(c.revenue, 400_000);
  close(c.ebitda, 135_000);
  close(c.ebit, 120_000); // 30% operating margin
  close(c.netIncome, 100_000);
  close(c.netDebt, 40_000);
  close(c.da, 12_000); // latest annual row, not the older one
  close(c.capex, 9_500); // sign flipped to positive spend
  close(c.revenueGrowthYoY, 5);
  close(c.ebitdaMargin, 33.75);
  assert.equal(c.fiscalYear, "FY2024");
  assert.equal(c.description, "Example Corp designs phones.");
  assert.equal(c.source?.verified, true);
  assert.deepEqual(c.source?.warnings, []);
  assert.equal(c.verifiedDA, true);
});

test("converts foreign-currency financials into the trading currency", () => {
  const c = mapYahooToCompany("ADR", {
    summary: summary({ financialData: { financialCurrency: "TWD" } }),
    annual,
    fx: 0.03,
  });
  close(c.revenue, 400_000 * 0.03);
  close(c.netDebt, 40_000 * 0.03);
  close(c.capex, 9_500 * 0.03);
  close(c.eps, (100_000 * 0.03) / 15_000); // derived, not Yahoo's TWD trailingEps
  close(c.marketCap, 3_000_000); // market data already in USD
  assert.match(c.source!.warnings[0], /TWD.*USD/);
});

test("flags missing statement data instead of inventing it", () => {
  const c = mapYahooToCompany("THIN", { summary: summary({ financialData: { totalDebt: undefined, totalCash: undefined } }), annual: [] });
  assert.equal(c.verifiedDA, false);
  assert.equal(c.netDebt, 0);
  assert.ok(c.source!.warnings.some(w => /D&A/.test(w)));
  assert.ok(c.source!.warnings.some(w => /net debt/.test(w)));
});

test("throws when there is no price", () => {
  assert.throws(() => mapYahooToCompany("NONE", { summary: { price: {} } }), /No market price/);
});
