import { test } from "node:test";
import assert from "node:assert/strict";
import { runDueDiligence, filingFlags, lastTwoYears, altmanZ, beneishM } from "./dueDiligence";
import { SecCompanyFacts } from "./secFacts";

const M = 1e6;
const yr = (end: string, start: string, val: number, filed: string, accn: string) => ({ start, end, val: val * M, form: "10-K", filed, fy: Number(end.slice(0, 4)), fp: "FY", accn });
const bal = (end: string, val: number, filed: string, accn: string) => ({ end, val: val * M, form: "10-K", filed, accn });
const A25 = "0000000001-25-000001", A24 = "0000000001-24-000001";
const flow = (v25: number, v24: number) => ({ units: { USD: [yr("2025-12-31", "2025-01-01", v25, "2026-02-20", A25), yr("2024-12-31", "2024-01-01", v24, "2025-02-20", A24)] } });
const stock = (v25: number, v24: number) => ({ units: { USD: [bal("2025-12-31", v25, "2026-02-20", A25), bal("2024-12-31", v24, "2025-02-20", A24)] } });

// A healthy services company (non-manufacturer).
const facts = (): SecCompanyFacts => ({
  cik: 1,
  facts: {
    "us-gaap": {
      Revenues: flow(1000, 900),
      CostOfRevenue: flow(600, 540),
      OperatingIncomeLoss: flow(150, 130),
      NetIncomeLoss: flow(100, 90),
      NetCashProvidedByUsedInOperatingActivities: flow(130, 110),
      SellingGeneralAndAdministrativeExpense: flow(200, 180),
      Depreciation: flow(40, 36),
      InterestExpense: flow(20, 20),
      Assets: stock(2000, 1800),
      AssetsCurrent: stock(700, 650),
      LiabilitiesCurrent: stock(400, 380),
      Liabilities: stock(1000, 950),
      AccountsReceivableNetCurrent: stock(150, 135),
      PropertyPlantAndEquipmentNet: stock(800, 720),
      RetainedEarningsAccumulatedDeficit: stock(600, 520),
      LongTermDebtNoncurrent: stock(400, 400),
      StockholdersEquity: stock(1000, 850),
    },
  },
});
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("Altman Z'' for a non-manufacturer, by hand", () => {
  const [cur] = lastTwoYears(facts())!;
  const z = altmanZ(cur, 5000, "7372");
  const expected = 6.56 * (300 / 2000) + 3.26 * (600 / 2000) + 6.72 * (150 / 2000) + 1.05 * (1000 / 1000);
  close(z.score!, expected);
  assert.equal(z.severity, "ok"); // 3.5 > 2.6
  assert.match(z.detail, /Z''/);
});

test("Altman Z for a manufacturer uses market cap and sales", () => {
  const [cur] = lastTwoYears(facts())!;
  const z = altmanZ(cur, 500, "3571");
  const expected = 1.2 * (300 / 2000) + 1.4 * (600 / 2000) + 3.3 * (150 / 2000) + 0.6 * (500 / 1000) + 1.0 * (1000 / 2000);
  close(z.score!, expected);
  assert.equal(z.severity, "high"); // 1.4 < 1.81
});

test("Beneish M-score, by hand", () => {
  const [cur, prev] = lastTwoYears(facts())!;
  const m = beneishM(cur, prev);
  const DSRI = (150 / 1000) / (135 / 900);
  const GMI = (360 / 900) / (400 / 1000);
  const AQI = (1 - (700 + 800) / 2000) / (1 - (650 + 720) / 1800);
  const SGI = 1000 / 900;
  const DEPI = (36 / (36 + 720)) / (40 / (40 + 800));
  const SGAI = (200 / 1000) / (180 / 900);
  const LVGI = ((400 + 400) / 2000) / ((380 + 400) / 1800);
  const TATA = (100 - 130) / 2000;
  const expected = -4.84 + 0.92 * DSRI + 0.528 * GMI + 0.404 * AQI + 0.892 * SGI + 0.115 * DEPI - 0.172 * SGAI + 4.679 * TATA - 0.327 * LVGI;
  close(m.score!, expected);
  assert.equal(m.severity, "ok");
});

test("flags profit not backed by cash and links the filing", () => {
  const f = facts();
  f.facts!["us-gaap"].NetCashProvidedByUsedInOperatingActivities = flow(-50, 110);
  const dd = runDueDiligence(f, undefined, { marketCap: 5000, netDebt: 300, ebitda: 190, ebit: 150 }, new Date("2026-03-01"));
  const acc = dd.flags.find(x => x.id === "accruals")!;
  assert.equal(acc.severity, "high");
  assert.match(acc.detail, /burned cash/);
  assert.equal(acc.links![0].url, `https://www.sec.gov/Archives/edgar/data/1/000000000125000001/${A25}-index.htm`);
  assert.equal(dd.fiscalYear, "2025-12-31");
  // Internal fact lists are not sent to the browser.
  assert.ok(dd.flags.every(x => !("facts" in x)));
});

test("leverage: net debt / EBITDA and interest cover", () => {
  const dd = runDueDiligence(facts(), undefined, { marketCap: 5000, netDebt: 950, ebitda: 190, ebit: 150 });
  const lev = dd.flags.find(x => x.id === "leverage")!;
  assert.equal(lev.severity, "high"); // 5.0x
  assert.match(lev.detail, /5\.0x.*7\.5x/);
});

test("8-K events, late filings and amendments from the filing index", () => {
  const subs = {
    filings: {
      recent: {
        form: ["8-K", "8-K", "NT 10-K", "10-K/A", "8-K", "8-K"],
        filingDate: ["2026-01-10", "2025-06-01", "2025-03-03", "2025-04-01", "2025-05-05", "2019-01-01"],
        accessionNumber: ["a1", "a2", "a3", "a4", "a5", "a6"],
        items: ["4.02,9.01", "4.01", "", "", "2.02,9.01", "1.03"],
      },
    },
  };
  const flags = filingFlags(subs, 1, new Date("2026-03-01"));
  const by = (id: string) => flags.find(x => x.id === id)!;
  assert.equal(by("8k-4.02").severity, "high");
  assert.equal(by("8k-4.02").links![0].label, "8-K 2026-01-10");
  assert.equal(by("8k-4.01").severity, "medium");
  assert.equal(by("8k-1.03").severity, "ok"); // 2019 is outside the 3-year window
  assert.equal(by("late").severity, "medium");
  assert.equal(by("amended").severity, "low");
});

test("missing data is reported as not available, never as safe", () => {
  const dd = runDueDiligence({ cik: 1, facts: { "us-gaap": {} } }, undefined, { marketCap: 1, netDebt: 0, ebitda: 1, ebit: 1 });
  assert.ok(dd.flags.every(x => x.severity === "na"), JSON.stringify(dd.flags));
});
