import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MC, distribution, normal, rng, simulateAccretion, simulateDcf, triangular } from "./monteCarlo";
import { computeDCF } from "./dcf";
import { computeAccretion } from "./accretion";
import { mapSecToCompany } from "./secFacts";
import { secFacts, secSubmissions } from "./__fixtures__/secFacts";
import { CompanyData, DealState } from "../types";

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a: number[]) => Math.sqrt(mean(a.map(x => (x - mean(a)) ** 2)));
const draws = (n: number, f: () => number) => Array.from({ length: n }, f);

test("random draws: seeded, and the right shape", () => {
  assert.deepEqual(draws(5, rng(42)), draws(5, rng(42)));
  assert.notDeepEqual(draws(5, rng(42)), draws(5, rng(43)));
  const u = draws(20000, rng(1));
  assert.ok(u.every(x => x >= 0 && x < 1));
  const r = rng(2);
  const z = draws(20000, () => normal(r));
  assert.ok(Math.abs(mean(z)) < 0.03 && Math.abs(sd(z) - 1) < 0.03, `${mean(z)} ${sd(z)}`);
  const r3 = rng(3);
  const tri = draws(20000, () => triangular(r3, 2, 5, 14));
  assert.ok(tri.every(x => x >= 2 && x <= 14));
  assert.ok(Math.abs(mean(tri) - 7) < 0.1, String(mean(tri)));
  assert.equal(triangular(r3, 4, 4, 4), 4);
});

test("distribution: percentiles and a histogram that counts the middle 98%", () => {
  const d = distribution(Array.from({ length: 101 }, (_, i) => i), 10)!;
  assert.equal(d.p50, 50);
  assert.equal(d.p10, 10);
  assert.equal(d.bins.length, 10);
  assert.equal(d.bins.reduce((s, b) => s + b.count, 0), 99);
  assert.equal(distribution([NaN]), undefined);
});

const t = { revenue: 1000, netDebt: 200, sharesOutstanding: 50 } as CompanyData;
const dcf = { bear: 4, base: 8, bull: 12, ebitM: 20, wacc: 9, tgr: 3, daPct: 4, cxPct: 5, tax: 25 };
const state = (mc: Partial<DealState["mc"]> = {}, d: Partial<typeof dcf> = {}) =>
  ({ dcf: { ...dcf, ...d }, deal: { offer: 40, cashPct: 50, stockPct: 50, fees: 2, finRate: 6 }, mc: { ...DEFAULT_MC, ...mc } }) as DealState;

test("DCF simulation with no uncertainty equals the base-case DCF", () => {
  const sim = simulateDcf(state({ marginSd: 0, waccSd: 0, tgrSd: 0, runs: 200 }, { bear: 8, bull: 8 }), t)!;
  const base = computeDCF(8, dcf, t)!.price;
  assert.ok(Math.abs(sim.price.p5 - base) < 1e-9 && Math.abs(sim.price.p95 - base) < 1e-9);
  assert.equal(sim.probOfferAbove, 40 > base ? 1 : 0);
});

test("DCF simulation: a spread around the base case, repeatable, and the offer probability", () => {
  const a = simulateDcf(state(), t)!;
  const b = simulateDcf(state(), t)!;
  assert.deepEqual(a, b, "same seed, same result");
  const base = computeDCF(8, dcf, t)!.price;
  assert.equal(a.price.n, DEFAULT_MC.runs);
  assert.ok(a.price.p10 < a.price.p50 && a.price.p50 < a.price.p90);
  assert.ok(Math.abs(a.price.p50 / base - 1) < 0.1, `${a.price.p50} vs ${base}`);
  // The probability matches counting draws below the offer: the offer at the median gives ~50%.
  const atMedian = simulateDcf({ ...state(), deal: { ...state().deal, offer: a.price.p50 } }, t)!;
  assert.ok(Math.abs(atMedian.probOfferAbove - 0.5) < 0.01, String(atMedian.probOfferAbove));
});

test("terminal growth is kept below WACC so every draw has a value", () => {
  const sim = simulateDcf(state({ tgrSd: 2, waccSd: 2 }, { wacc: 6, tgr: 4.5 }), t)!;
  assert.equal(sim.price.n, DEFAULT_MC.runs);
});

const co = mapSecToCompany("EXM", secFacts(), secSubmissions(), { provider: "Stooq", price: 500, currency: "USD", time: new Date() });
const acq = { ...co, ticker: "BUY", netIncome: co.netIncome * 3, sharesOutstanding: co.sharesOutstanding * 2 };
const deal = (mc: Partial<DealState["mc"]> = {}) =>
  ({
    deal: { offer: 600, cashPct: 50, stockPct: 50, fees: 2, finRate: 6 },
    syn: { cSell: 500, geo: 0, prc: 0, bnd: 0, rR: 50, hc: 2000, proc: 0, fac: 0, it: 0, cR: 80, sev: 0, itI: 0, leg: 0 },
    ppa: { intangPct: 30, life: 10 },
    dcf: { ...dcf, tax: 21 },
    mc: { ...DEFAULT_MC, ...mc },
  }) as DealState;

test("accretion simulation with no uncertainty equals the deterministic result", () => {
  const s = deal({ synergyLow: 100, synergyHigh: 100, finRateSd: 0, acquirerPriceSd: 0, runs: 100 });
  const sim = simulateAccretion(s, co, acq)!;
  const base = computeAccretion({ target: co, acquirer: acq, deal: s.deal, syn: s.syn, ppa: s.ppa, taxRate: 21 });
  assert.ok(Math.abs(sim.accretion.p50 - base.accretionPct) < 1e-9);
  assert.equal(sim.probAccretive, base.accretive ? 1 : 0);
});

test("accretion simulation: lower synergy realisation shifts the outcome down", () => {
  const full = simulateAccretion(deal({ synergyLow: 90, synergyHigh: 110 }), co, acq)!;
  const half = simulateAccretion(deal({ synergyLow: 30, synergyHigh: 70 }), co, acq)!;
  assert.ok(half.accretion.p50 < full.accretion.p50);
  assert.ok(half.probAccretive <= full.probAccretive);
  assert.ok(full.accretion.p10 < full.accretion.p90);
});

test("accretion simulation is skipped when the acquirer has no positive EPS", () => {
  assert.equal(simulateAccretion(deal(), co, { ...acq, netIncome: -1 }), undefined);
});
