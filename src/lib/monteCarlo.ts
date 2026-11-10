import { CompanyData, DealState } from "../types";
import { computeDCF } from "./dcf";
import { computeAccretion } from "./accretion";
import { percentile } from "./stats";

/**
 * Monte Carlo range of outcomes. Instead of three hand-picked cases, the uncertain inputs are drawn
 * thousands of times and the DCF value per share and EPS accretion are recomputed for each draw.
 * Seeded, so the same inputs always give the same result. Pure, no DOM.
 *
 * Draws (independent of each other):
 *  - Revenue growth: triangular between the bear, base and bull cases.
 *  - EBIT margin, WACC, terminal growth: normal around the model's value (terminal growth kept at least
 *    1 point below WACC).
 *  - Synergy realisation: uniform between a low and high share of the plan.
 *  - Financing rate: normal around the deal's rate.
 *  - Acquirer share price (sets how many new shares a stock deal issues): normal % move around today's.
 */
export type MCSettings = DealState["mc"];

export const DEFAULT_MC: MCSettings = {
  runs: 5000,
  marginSd: 2,
  waccSd: 1,
  tgrSd: 0.5,
  synergyLow: 50,
  synergyHigh: 110,
  finRateSd: 0.75,
  acquirerPriceSd: 10,
  seed: 1,
};

/** Small fast seeded PRNG (mulberry32): uniform in [0, 1). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw (Box–Muller). */
export function normal(u: () => number) {
  const u1 = Math.max(u(), 1e-12);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u());
}

/** Triangular draw between min and max with the given mode. */
export function triangular(u: () => number, min: number, mode: number, max: number) {
  const lo = Math.min(min, mode, max);
  const hi = Math.max(min, mode, max);
  const m = Math.min(Math.max(mode, lo), hi);
  if (hi === lo) return lo;
  const x = u();
  const f = (m - lo) / (hi - lo);
  return x < f ? lo + Math.sqrt(x * (hi - lo) * (m - lo)) : hi - Math.sqrt((1 - x) * (hi - lo) * (hi - m));
}

export interface Distribution {
  /** Valid draws (a draw is dropped only if the model is undefined for it). */
  n: number;
  mean: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  /** Histogram over the 1st–99th percentile range. */
  bins: { from: number; to: number; count: number }[];
}

export function distribution(values: number[], binCount = 30): Distribution | undefined {
  const v = values.filter(Number.isFinite);
  if (!v.length) return undefined;
  const lo = percentile(v, 0.01);
  const hi = percentile(v, 0.99);
  const width = (hi - lo) / binCount || 1;
  const bins = Array.from({ length: binCount }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
  for (const x of v) {
    if (x < lo || x > hi) continue;
    bins[Math.min(binCount - 1, Math.floor((x - lo) / width))].count++;
  }
  const q = (p: number) => percentile(v, p);
  return {
    n: v.length,
    mean: v.reduce((s, x) => s + x, 0) / v.length,
    p5: q(0.05), p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95),
    bins,
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface DcfSimulation {
  price: Distribution;
  /** Share of draws where the offer price is above the DCF value per share (the buyer pays more than modelled value). */
  probOfferAbove: number;
}

/** DCF value per target share across random draws of growth, margin, WACC and terminal growth. */
export function simulateDcf(state: Pick<DealState, "dcf" | "deal" | "mc">, t: Pick<CompanyData, "revenue" | "netDebt" | "sharesOutstanding">): DcfSimulation | undefined {
  const { dcf, mc } = state;
  if (!(t.sharesOutstanding > 0) || !(t.revenue > 0)) return undefined;
  const u = rng(mc.seed);
  const prices: number[] = [];
  for (let i = 0; i < mc.runs; i++) {
    const growth = triangular(u, dcf.bear, dcf.base, dcf.bull);
    const ebitM = clamp(dcf.ebitM + mc.marginSd * normal(u), -50, 80);
    const wacc = Math.max(1, dcf.wacc + mc.waccSd * normal(u));
    const tgr = Math.min(dcf.tgr + mc.tgrSd * normal(u), wacc - 1);
    const r = computeDCF(growth, { ...dcf, ebitM, wacc, tgr }, t);
    if (r && Number.isFinite(r.price)) prices.push(r.price);
  }
  const price = distribution(prices);
  if (!price) return undefined;
  const offer = state.deal.offer;
  return { price, probOfferAbove: prices.filter(p => offer > p).length / prices.length };
}

export interface AccretionSimulation {
  accretion: Distribution;
  /** Share of draws where pro-forma EPS is at least standalone EPS. */
  probAccretive: number;
}

/** EPS accretion / dilution across random draws of synergy realisation, financing rate and acquirer share price. */
export function simulateAccretion(state: Pick<DealState, "deal" | "syn" | "ppa" | "dcf" | "mc">, target: CompanyData, acquirer: CompanyData): AccretionSimulation | undefined {
  const { mc } = state;
  const base = computeAccretion({ target, acquirer, deal: state.deal, syn: state.syn, ppa: state.ppa, taxRate: state.dcf.tax });
  if (!base.meaningful) return undefined;
  const u = rng(mc.seed + 7919);
  const out: number[] = [];
  let accretive = 0;
  for (let i = 0; i < mc.runs; i++) {
    const real = (mc.synergyLow + (mc.synergyHigh - mc.synergyLow) * u()) / 100;
    const finRate = Math.max(0, state.deal.finRate + mc.finRateSd * normal(u));
    const price = acquirer.currentPrice * Math.max(0.2, 1 + (mc.acquirerPriceSd / 100) * normal(u));
    const r = computeAccretion({
      target,
      acquirer: { ...acquirer, currentPrice: price },
      deal: { ...state.deal, finRate },
      syn: { ...state.syn, rR: state.syn.rR * real, cR: state.syn.cR * real },
      ppa: state.ppa,
      taxRate: state.dcf.tax,
    });
    if (!Number.isFinite(r.accretionPct)) continue;
    out.push(r.accretionPct);
    if (r.accretive) accretive++;
  }
  const accretion = distribution(out);
  return accretion ? { accretion, probAccretive: accretive / out.length } : undefined;
}
