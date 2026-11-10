import { test } from "node:test";
import assert from "node:assert/strict";
import { ltm, mapSecToCompany } from "./secFacts";
import { ACCN, secFacts, secSubmissions } from "./__fixtures__/secFacts";
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

test("cites the exact SEC filings behind each reported figure", () => {
  const c = mapSecToCompany("EXM", secFacts(), secSubmissions(), quote);
  const cit = c.citations!;

  // LTM revenue = FY2025 10-K + Q1 FY2026 10-Q - prior-year Q1 (as restated in the same 10-Q).
  const rev = cit.revenue!;
  assert.equal(rev.kind, "sec");
  assert.deepEqual(rev.facts.map(f => [f.accn, f.sign, f.end]), [
    [ACCN.k25, 1, "2025-06-30"],
    [ACCN.q126, 1, "2025-09-30"],
    [ACCN.q126, -1, "2024-09-30"],
  ]);
  assert.equal(rev.facts[0].concept, "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax");
  assert.equal(rev.facts[0].url, "https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/exm-20250630.htm");
  assert.match(rev.method, /Last twelve months to 2025-09-30/);
  // The cited facts reproduce the figure shown.
  close(rev.facts.reduce((s, f) => s + f.sign * f.value, 0) / 1e6, c.revenue);

  // Net debt: debt added, cash and short-term investments subtracted, and they add back up.
  const nd = cit.netDebt!;
  assert.deepEqual(nd.facts.map(f => [f.concept, f.sign]), [
    ["us-gaap:LongTermDebtNoncurrent", 1],
    ["us-gaap:LongTermDebtCurrent", 1],
    ["us-gaap:CashAndCashEquivalentsAtCarryingValue", -1],
    ["us-gaap:ShortTermInvestments", -1],
  ]);
  close(nd.facts.reduce((s, f) => s + f.sign * f.value, 0) / 1e6, c.netDebt);

  // Shares come from the cover page (dei), price from the market feed, ratios are marked as calculated.
  assert.equal(cit.sharesOutstanding!.facts[0].concept, "dei:EntityCommonStockSharesOutstanding");
  assert.equal(cit.sharesOutstanding!.facts[0].unit, "shares");
  assert.equal(cit.currentPrice!.kind, "market");
  assert.match(cit.currentPrice!.method, /Stooq/);
  assert.equal(cit.evEbitda!.kind, "derived");
  assert.deepEqual(cit.ebitda!.inputs, ["ebit", "da"]);
});

test("every cited SEC figure adds back up to the number shown", () => {
  const c = mapSecToCompany("EXM", secFacts(), secSubmissions(), quote);
  for (const k of ["revenue", "ebit", "netIncome", "da"] as const) {
    const sum = c.citations![k]!.facts.reduce((s, f) => s + f.sign * f.value, 0) / 1e6;
    close(sum, c[k]);
  }
});

test("links to the filing index when the main document is unknown, and labels a typed-in price", () => {
  const c = mapSecToCompany("EXM", secFacts(), undefined, { ...quote, provider: "entered by user" });
  assert.equal(
    c.citations!.revenue!.facts[1].url,
    "https://www.sec.gov/Archives/edgar/data/789019/000119312525256321/0001193125-25-256321-index.htm",
  );
  assert.equal(c.citations!.currentPrice!.kind, "user");
});

test("debt from an older filing is cited with that filing's date", () => {
  const f = secFacts();
  delete f.facts!["us-gaap"].LongTermDebtNoncurrent;
  delete f.facts!["us-gaap"].LongTermDebtCurrent;
  const c = mapSecToCompany("EXM", f, undefined, quote);
  const debt = c.citations!.netDebt!.facts.filter(x => x.sign === 1);
  assert.deepEqual(debt.map(x => [x.concept, x.end, x.form]), [["us-gaap:LongTermDebt", "2025-06-30", "10-K"]]);
  close(c.citations!.netDebt!.facts.reduce((s, x) => s + x.sign * x.value, 0) / 1e6, c.netDebt);
});
