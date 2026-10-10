import { test } from "node:test";
import assert from "node:assert/strict";
import { ltm, mapSecToCompany } from "./secFacts";
import { secFacts } from "./__fixtures__/secFacts";
import { Quote } from "./quote";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const quote: Quote = { provider: "Stooq", price: 500, currency: "USD", time: new Date("2025-10-31T00:00:00Z") };

test("LTM = latest fiscal year + current YTD - prior-year YTD", () => {
  const rev = secFacts().facts!["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units!.USD;
  const v = ltm(rev)!;
  close(v.value, (280_000 + 77_000 - 65_600) * 1e6);
  assert.equal(v.end, "2025-09-30");
  assert.equal(v.isLTM, true);
  close(v.yoy!, 77_000 / 65_600 - 1);
});

test("falls back to the latest fiscal year when there is no later quarter", () => {
  const rev = secFacts().facts!["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units!.USD
    .filter(r => r.form === "10-K");
  const v = ltm(rev)!;
  close(v.value, 280_000 * 1e6);
  assert.equal(v.isLTM, false);
  close(v.yoy!, 280_000 / 245_000 - 1);
});

test("maps SEC facts and a quote into CompanyData (USD millions)", () => {
  const c = mapSecToCompany("EXM", secFacts(), { name: "Example Corp", sicDescription: "Services-Prepackaged Software", exchanges: ["Nasdaq"] }, quote);
  assert.equal(c.name, "Example Corp");
  assert.equal(c.sector, "Services-Prepackaged Software");
  close(c.sharesOutstanding, 7_433); // latest cover page
  close(c.marketCap, 500 * 7_433);
  close(c.revenue, 291_400);
  close(c.ebit, 128_000 + 38_000 - 30_500);
  close(c.da, 34_000 + 9_000 - 7_000);
  close(c.ebitda, 135_500 + 36_000);
  close(c.capex, 64_500 + 19_400 - 14_900);
  close(c.netIncome, 101_800 + 27_700 - 24_700);
  // Debt at the latest balance-sheet date (noncurrent + current), less cash and short-term investments.
  close(c.netDebt, 40_000 + 2_900 - 28_800 - 73_000);
  close(c.bookValuePerShare, 363_000 / 7_433);
  close(c.eps, 104_800 / 7_433);
  close(c.revenueGrowthYoY, (77_000 / 65_600 - 1) * 100);
  assert.equal(c.fiscalYear, "LTM 2025-09-30");
  assert.equal(c.source?.verified, true);
  assert.match(c.source!.provider, /SEC EDGAR.*Stooq/);
  assert.equal(c.verifiedDA, true);
});

test("uses the latest filing that reports debt when the current quarter doesn't", () => {
  const f = secFacts();
  delete f.facts!["us-gaap"].LongTermDebtNoncurrent;
  delete f.facts!["us-gaap"].LongTermDebtCurrent;
  const c = mapSecToCompany("EXM", f, undefined, quote);
  close(c.netDebt, 43_000 - 28_800 - 73_000);
  assert.ok(c.source!.warnings.some(w => /2025-06-30/.test(w)));
  assert.equal(c.name, "EXAMPLE CORP");
});

test("sums share classes reported on the same cover page", () => {
  const f = secFacts();
  f.facts!.dei.EntityCommonStockSharesOutstanding.units!.shares.push({ end: "2025-10-20", val: 1_000e6, form: "10-Q", filed: "2025-10-29" });
  const c = mapSecToCompany("EXM", f, undefined, quote);
  close(c.sharesOutstanding, 8_433);
});

test("refuses filers without US GAAP revenue (e.g. IFRS 20-F filers)", () => {
  assert.throws(() => mapSecToCompany("FPI", { facts: { "us-gaap": {} } }, undefined, quote), /no annual revenue/);
});
