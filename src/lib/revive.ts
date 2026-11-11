import { CompanyData, Peer } from "../types";

/**
 * JSON has no NaN: a figure the server couldn't compute (e.g. P/E for a loss-making company)
 * arrives as null. Left as null it crashes formatting (null.toFixed) and silently counts as 0
 * in arithmetic, so turn it back into NaN, which every calculation and formatter treats as "n/a".
 */
const COMPANY_NUMBERS: (keyof CompanyData)[] = [
  "currentPrice", "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "sharesOutstanding", "marketCap", "revenue", "ebitda", "ebit",
  "netIncome", "eps", "da", "capex", "netDebt", "bookValuePerShare", "dividendPerShare", "peRatio", "evEbitda",
  "evRevenue", "pbRatio", "revenueGrowthYoY", "ebitdaMargin", "netMargin",
];
const PEER_NUMBERS: (keyof Peer)[] = ["price", "marketCap", "netDebt", "revenue", "ebitda", "netIncome", "evRevenue", "evEbitda", "pe"];

function revive<T extends object>(obj: T, keys: (keyof T)[]): T {
  const out: any = { ...obj };
  for (const k of keys) if (typeof out[k] !== "number") out[k] = out[k] == null || out[k] === "" ? NaN : Number(out[k]);
  return out;
}

export const reviveCompany = (c: CompanyData): CompanyData => revive(c, COMPANY_NUMBERS);
export const revivePeer = (p: Peer): Peer => revive(p, PEER_NUMBERS);
