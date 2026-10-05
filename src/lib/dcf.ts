import { CompanyData, DealState } from "../types";

export type DCFAssumptions = DealState["dcf"];

export interface DCFResult {
  EV: number;
  eq: number;
  price: number;
  sumPV: number;
  pvTV: number;
  tvPct: number;
}

/**
 * 5-year unlevered FCF DCF with a Gordon-growth terminal value.
 * FCF = EBIT x (1 - tax) + D&A - CapEx, all driven as % of revenue.
 * Returns null when WACC <= terminal growth (model undefined).
 */
export function computeDCF(
  growth: number,
  d: DCFAssumptions,
  t: Pick<CompanyData, "revenue" | "netDebt" | "sharesOutstanding">,
): DCFResult | null {
  const wacc = d.wacc / 100;
  const tgr = d.tgr / 100;
  if (wacc <= tgr) return null;

  const tax = d.tax / 100;
  const daP = d.daPct / 100;
  const cxP = d.cxPct / 100;
  const eM = d.ebitM / 100;

  let rev = t.revenue;
  let sumPV = 0;
  let lastFCF = 0;

  for (let y = 1; y <= 5; y++) {
    rev *= 1 + growth / 100;
    const fcf = rev * eM * (1 - tax) + rev * daP - rev * cxP;
    sumPV += fcf / Math.pow(1 + wacc, y);
    lastFCF = fcf;
  }

  const tv = (lastFCF * (1 + tgr)) / (wacc - tgr);
  const pvTV = tv / Math.pow(1 + wacc, 5);
  const EV = sumPV + pvTV;
  const eq = EV - t.netDebt;
  const price = eq / t.sharesOutstanding;

  return { EV, eq, price, sumPV, pvTV, tvPct: (pvTV / EV) * 100 };
}
