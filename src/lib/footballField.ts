import { CompanyData, DealState, PrecedentDeal } from "../types";
import { computeDCF } from "./dcf";

/**
 * Football field: implied value per target share from each method, as low–high ranges,
 * next to the offer price. Pure so it can be tested.
 */
export interface FieldRow {
  method: string;
  low: number;
  high: number;
  /** Central estimate (e.g. base case, median multiple), when there is one. */
  mid?: number;
  /** How the range was built, in plain words. */
  basis: string;
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Linear-interpolated percentile (p in 0..1). */
export const percentile = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  const f = Math.floor(i);
  return s[f] + (s[Math.min(f + 1, s.length - 1)] - s[f]) * (i - f);
};

/**
 * Range of a set of deal figures. With 4+ deals use the interquartile range (25th–75th percentile),
 * the usual banker convention, so one outlier deal can't stretch the chart; with fewer use min–max.
 */
function spread(v: number[]) {
  const iqr = v.length >= 4;
  const low = iqr ? percentile(v, 0.25) : Math.min(...v);
  const high = iqr ? percentile(v, 0.75) : Math.max(...v);
  const mid = median(v);
  const f = (n: number, u: string) => `${n.toFixed(1)}${u}`;
  return {
    low, high, mid,
    label: (n: number, u: string) => `${n} selected deal(s), ${iqr ? "25th–75th percentile " : ""}${f(low, u)}–${f(high, u)} (median ${f(mid, u)}${iqr ? `; full range ${f(Math.min(...v), u)}–${f(Math.max(...v), u)}` : ""})`,
  };
}

/** Per-share equity value implied by an EV multiple: (multiple × metric − net debt) ÷ shares. */
export const priceFromMultiple = (multiple: number, metricMn: number, t: Pick<CompanyData, "netDebt" | "sharesOutstanding">) =>
  (multiple * metricMn - t.netDebt) / t.sharesOutstanding;

export function footballField(state: DealState, precedents: PrecedentDeal[]): FieldRow[] {
  const t = state.target;
  if (!t || !(t.sharesOutstanding > 0)) return [];
  const rows: FieldRow[] = [];
  const cur = t.currency;

  if (t.fiftyTwoWeekHigh > t.fiftyTwoWeekLow && t.fiftyTwoWeekLow > 0) {
    rows.push({ method: "52-week trading range", low: t.fiftyTwoWeekLow, high: t.fiftyTwoWeekHigh, mid: t.currentPrice, basis: `Low and high share price over the past year; marker at today's ${cur}${t.currentPrice.toFixed(2)}.` });
  }

  // DCF: bear to bull growth case, base case as the marker.
  const dcf = (["bear", "base", "bull"] as const).map(k => computeDCF(state.dcf[k], state.dcf, t)?.price);
  if (dcf.every(p => p !== undefined && Number.isFinite(p))) {
    const [bear, base, bull] = dcf as number[];
    rows.push({ method: "DCF (bear to bull)", low: Math.min(bear, bull), high: Math.max(bear, bull), mid: base, basis: `5-year DCF at ${state.dcf.wacc}% WACC and ${state.dcf.tgr}% terminal growth; revenue growth ${state.dcf.bear}% / ${state.dcf.base}% / ${state.dcf.bull}%.` });
  }
  // DCF sensitivity: WACC ±1 point and terminal growth ±0.5 point around the base case.
  const sens: number[] = [];
  for (const dw of [-1, 1]) for (const dg of [-0.5, 0.5]) {
    const r = computeDCF(state.dcf.base, { ...state.dcf, wacc: state.dcf.wacc + dw, tgr: state.dcf.tgr + dg }, t);
    if (r && Number.isFinite(r.price)) sens.push(r.price);
  }
  if (sens.length === 4) {
    rows.push({ method: "DCF sensitivity (WACC ±1%, growth ±0.5%)", low: Math.min(...sens), high: Math.max(...sens), mid: computeDCF(state.dcf.base, state.dcf, t)?.price, basis: "Base case re-run with WACC one point higher/lower and terminal growth half a point higher/lower." });
  }

  const deals = state.selectedPrecedents.map(i => precedents[i]).filter(Boolean);
  const pick = (k: "evEv" | "evRev" | "prem") => deals.map(d => d[k]).filter((v): v is number => v !== null && Number.isFinite(v));
  const evE = pick("evEv");
  if (evE.length && t.ebitda > 0) {
    const s = spread(evE);
    rows.push({ method: "Precedents: EV/EBITDA", low: priceFromMultiple(s.low, t.ebitda, t), high: priceFromMultiple(s.high, t.ebitda, t), mid: priceFromMultiple(s.mid, t.ebitda, t), basis: `${s.label(evE.length, "x")} applied to the target's EBITDA, less net debt.` });
  }
  const evR = pick("evRev");
  if (evR.length && t.revenue > 0) {
    const s = spread(evR);
    rows.push({ method: "Precedents: EV/Revenue", low: priceFromMultiple(s.low, t.revenue, t), high: priceFromMultiple(s.high, t.revenue, t), mid: priceFromMultiple(s.mid, t.revenue, t), basis: `${s.label(evR.length, "x")} applied to the target's revenue, less net debt.` });
  }
  const prem = pick("prem");
  if (prem.length && t.currentPrice > 0) {
    const s = spread(prem);
    rows.push({ method: "Precedents: control premium", low: t.currentPrice * (1 + s.low / 100), high: t.currentPrice * (1 + s.high / 100), mid: t.currentPrice * (1 + s.mid / 100), basis: `Today's price plus premiums paid: ${s.label(prem.length, "%")}.` });
  }
  return rows;
}
