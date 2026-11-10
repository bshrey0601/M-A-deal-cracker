import { test } from "node:test";
import assert from "node:assert/strict";
import { mapSecToCompany } from "./secFacts";
import { secFacts, secSubmissions } from "./__fixtures__/secFacts";
import {
  balanceSheetCheck, epsCheck, filingFreshnessCheck, priceCheck, restatementCheck, sanityCheck, secondSourceCheck, sharesCheck,
} from "./accuracyChecks";
import { Quote } from "./quote";

const quote: Quote = { provider: "Stooq", price: 500, currency: "USD", time: new Date("2025-10-31T20:00:00Z") };
const NOW = new Date("2025-11-02T12:00:00Z");
const byId = (checks: { id: string }[], id: string) => checks.find(c => c.id === id) as any;

test("a clean SEC filer passes every check", () => {
  const c = mapSecToCompany("EXM", secFacts(), secSubmissions(), quote, NOW);
  const notPassed = c.checks!.filter(x => x.status !== "pass");
  assert.deepEqual(notPassed, []);
  assert.equal(c.checks!.length, 9);
  assert.match(byId(c.checks!, "balance-sheet").detail, /\$563,000 Mn.*match/);
  assert.match(byId(c.checks!, "eps").detail, /\$14\.10.*\$14\.12/);
});

test("flags a period the company restated", () => {
  const f = secFacts();
  // The latest 10-Q shows prior-year Q1 revenue 3% higher than first filed.
  const rows = f.facts!["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units!.USD;
  const recast = rows.find(r => r.end === "2024-09-30" && r.filed === "2025-10-29")!;
  recast.val *= 1.03;
  const c = mapSecToCompany("EXM", f, secSubmissions(), quote, NOW);
  const r = byId(c.checks!, "restatements");
  assert.equal(r.status, "warn");
  assert.match(r.detail, /Revenue for 2024-07-01 to 2024-09-30: first filed as \$65,600 Mn \(10-Q 2024-10-30\)/);
  // The cited filings still add up to the figure shown.
  assert.equal(byId(c.checks!, "citations").status, "pass");
});

test("flags stale filings, a stale or typed-in price, and mixed balance-sheet dates", () => {
  const f = secFacts();
  delete f.facts!["us-gaap"].LongTermDebtNoncurrent;
  delete f.facts!["us-gaap"].LongTermDebtCurrent;
  const later = new Date("2026-06-01T00:00:00Z");
  const c = mapSecToCompany("EXM", f, undefined, quote, later);
  assert.equal(byId(c.checks!, "filing-age").status, "fail");
  assert.equal(byId(c.checks!, "price-age").status, "warn");
  assert.equal(byId(c.checks!, "bs-dates").status, "warn");
  assert.match(byId(c.checks!, "bs-dates").detail, /2025-06-30.*2025-09-30/);

  const typed = mapSecToCompany("EXM", secFacts(), undefined, { ...quote, provider: "entered by user" }, NOW);
  assert.equal(byId(typed.checks!, "price-age").status, "warn");
  assert.match(byId(typed.checks!, "price-age").detail, /typed in/);
});

test("skips checks whose data the company doesn't file", () => {
  const f = secFacts();
  for (const k of ["Assets", "Liabilities", "LiabilitiesAndStockholdersEquity", "EarningsPerShareDiluted", "WeightedAverageNumberOfDilutedSharesOutstanding"]) {
    delete f.facts!["us-gaap"][k];
  }
  const c = mapSecToCompany("EXM", f, undefined, quote, NOW);
  for (const id of ["balance-sheet", "eps", "shares"]) assert.equal(byId(c.checks!, id).status, "skipped", id);
});

test("balance sheet: gaps over 2% fail, small gaps warn", () => {
  assert.equal(balanceSheetCheck({ date: "d", assets: 100e6, liabilities: 60e6, equityInclNci: 40e6 }).status, "pass");
  assert.equal(balanceSheetCheck({ date: "d", assets: 100e6, liabilities: 59e6, equityInclNci: 40e6 }).status, "warn");
  assert.equal(balanceSheetCheck({ date: "d", assets: 100e6, liabilities: 50e6, equityInclNci: 40e6 }).status, "fail");
  assert.equal(balanceSheetCheck({ date: "d", assets: 100e6, liabilitiesAndEquity: 100e6 }).status, "pass");
  assert.equal(balanceSheetCheck({ date: "d", assets: 100e6, liabilitiesAndEquity: 97e6 }).status, "fail");
});

test("second source: within 2% passes, otherwise flagged; unreachable is skipped", () => {
  assert.equal(secondSourceCheck(1000, { provider: "Yahoo Finance", revenueMn: 1015 }).status, "pass");
  assert.equal(secondSourceCheck(1000, { provider: "Yahoo Finance", revenueMn: 1050 }).status, "warn");
  assert.equal(secondSourceCheck(1000, { provider: "Yahoo Finance", revenueMn: 1300 }).status, "fail");
  const s = secondSourceCheck(1000, { provider: "Yahoo Finance", error: "HTTP 429" });
  assert.equal(s.status, "skipped");
  assert.match(s.detail, /HTTP 429/);
});

test("EPS, share count, freshness, price and sanity thresholds", () => {
  assert.equal(epsCheck(5, 5.05, "FY").status, "pass");
  assert.equal(epsCheck(5, 5.4, "FY").status, "warn");
  assert.equal(epsCheck(5, 7, "FY").status, "fail");
  assert.equal(sharesCheck(100e6, 104e6, "Q").status, "pass");
  assert.equal(sharesCheck(100e6, 200e6, "Q").status, "fail"); // e.g. a 2-for-1 split
  assert.equal(filingFreshnessCheck("2025-10-29", "2025-09-30", NOW).status, "pass");
  assert.equal(priceCheck("Finnhub", new Date("2025-10-20T00:00:00Z"), NOW).status, "warn");
  assert.equal(priceCheck("Finnhub", undefined, NOW).status, "warn");
  const bad = sanityCheck({ revenue: 100, ebit: 150, ebitda: 160, netIncome: 10, da: 10, capex: -1, sharesOutstanding: 10 });
  assert.equal(bad.status, "fail");
  assert.match(bad.detail, /operating income is larger than revenue.*CapEx is negative/);
});

test("restatement check ignores rounding-level differences", () => {
  const all = [
    { start: "a", end: "b", val: 1000e6, form: "10-Q", filed: "2024-01-01" },
    { start: "a", end: "b", val: 1003e6, form: "10-Q", filed: "2025-01-01" },
  ];
  assert.equal(restatementCheck([{ label: "Revenue", used: [all[1]], all }]).status, "pass");
});
