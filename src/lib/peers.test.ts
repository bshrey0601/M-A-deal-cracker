import { test } from "node:test";
import assert from "node:assert/strict";
import { compsStats, frameRevenue, impliedPrice, meaningful, parseSicListing, rankPeers, toPeer } from "./peers";
import { footballField } from "./footballField";
import { CompanyData, DealState, Peer } from "../types";

test("SIC listing: CIK and company name from EDGAR's table", () => {
  const html = `<table><tr><th>CIK</th><th>Company</th><th>State</th></tr>
    <tr><td valign="top"><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0000320193">0000320193</a></td><td>Apple Inc.</td><td>CA</td></tr>
    <tr><td><a href="x">0001045810</a></td><td>NVIDIA CORP</td><td>CA</td></tr>
    <tr><td>Next 100</td></tr></table>`;
  assert.deepEqual(parseSicListing(html), [
    { cik: 320193, name: "Apple Inc." },
    { cik: 1045810, name: "NVIDIA CORP" },
  ]);
});

test("frames: largest revenue per company across concepts; zero and negative ignored", () => {
  const m = frameRevenue([{ data: [{ cik: 1, val: 5 }, { cik: 2, val: 0 }] }, { data: [{ cik: 1, val: 7 }, { cik: 3, val: -1 }] }]);
  assert.deepEqual([...m], [[1, 7]]);
});

test("ranking: listed, has revenue, not excluded, closest on a log scale", () => {
  const members = [1, 2, 3, 4, 5, 6].map(cik => ({ cik, name: `C${cik}`, sic: "3571" }));
  const r = rankPeers({
    members: [...members, members[1]],
    revenueByCik: new Map([[1, 100], [2, 200], [3, 50], [4, 1000], [6, 120]]),
    tickerByCik: new Map([[1, "A"], [2, "B"], [3, "C"], [4, "D"], [5, "E"]]),
    excludeCiks: new Set([1]),
    targetRevenue: 100,
  });
  // 6 has no ticker, 5 no revenue, 1 excluded; 2 is listed twice but counted once. 200 and 50 tie on a log scale.
  assert.deepEqual(r.map(x => x.ticker), ["B", "C", "D"]);
});

const peer = (o: Partial<Peer>): Peer => ({
  ticker: "X", name: "X", currency: "$", price: 1, marketCap: 1, netDebt: 0, revenue: 1, ebitda: 1, netIncome: 1,
  evRevenue: NaN, evEbitda: NaN, pe: NaN, period: "", source: "", why: "", included: true, ...o,
});

test("peer multiples from company data; negative earnings are not meaningful", () => {
  const p = toPeer({ ticker: "A", name: "A", currency: "$", currentPrice: 10, marketCap: 1000, netDebt: 200, revenue: 400, ebitda: 100, netIncome: -5, fiscalYear: "LTM 2026-09-30" } as CompanyData, "why");
  assert.equal(p.evRevenue, 3);
  assert.equal(p.evEbitda, 12);
  assert.ok(Number.isNaN(p.pe));
  assert.equal(meaningful("pe", 150), false);
  assert.equal(meaningful("evEbitda", 12), true);
});

test("comps statistics use included, meaningful peers only", () => {
  const ps = [8, 10, 12, 14, 500].map((m, i) => peer({ ticker: `P${i}`, evEbitda: m }));
  ps.push(peer({ evEbitda: 9, included: false }));
  const s = compsStats(ps, "evEbitda")!;
  assert.deepEqual(s, { n: 4, q1: 9.5, median: 11, q3: 12.5 });
  assert.equal(compsStats(ps, "pe"), undefined);
});

test("implied price: EV multiples less net debt; P/E on net income", () => {
  const t = { revenue: 1000, ebitda: 200, netIncome: 100, netDebt: 300, sharesOutstanding: 10 };
  assert.equal(impliedPrice("evEbitda", 10, t), (2000 - 300) / 10);
  assert.equal(impliedPrice("evRevenue", 2, t), (2000 - 300) / 10);
  assert.equal(impliedPrice("pe", 15, t), 150);
  assert.ok(Number.isNaN(impliedPrice("pe", 15, { ...t, netIncome: -1 })));
});

test("football field gets trading comps rows from included peers", () => {
  const t = { currency: "$", currentPrice: 100, sharesOutstanding: 10, revenue: 1000, ebitda: 200, netIncome: 100, netDebt: 300 } as CompanyData;
  const state = {
    target: t, selectedPrecedents: [],
    dcf: { bear: 2, base: 5, bull: 8, ebitM: 15, wacc: 10, tgr: 3, daPct: 4, cxPct: 5, tax: 25 },
    peers: [peer({ evEbitda: 8, pe: 12 }), peer({ evEbitda: 12, pe: 18 }), peer({ evEbitda: 99, included: false })],
  } as unknown as DealState;
  const rows = footballField(state, []);
  const ev = rows.find(r => r.method === "Trading comps: EV/EBITDA")!;
  assert.equal(ev.low, impliedPrice("evEbitda", 8, t));
  assert.equal(ev.high, impliedPrice("evEbitda", 12, t));
  assert.equal(ev.mid, impliedPrice("evEbitda", 10, t));
  assert.match(ev.basis, /2 peer\(s\)/);
  const pe = rows.find(r => r.method === "Trading comps: P/E")!;
  assert.equal(pe.low, 120);
  assert.equal(pe.high, 180);
  assert.ok(!rows.some(r => r.method === "Trading comps: EV/Revenue"), "no meaningful EV/Revenue");
});
