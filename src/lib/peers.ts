import { CompanyData, Peer, PeerSearchInfo } from "../types";
import { tableRows } from "./marketInputs";
import { percentile } from "./stats";

/**
 * Trading comparables picked from SEC data. Pure, no network (server/peers.ts fetches).
 *
 *  1. Industry: every company EDGAR lists under the target's SIC code.
 *  2. Listed: keep those with a ticker in the SEC's company_tickers.json.
 *  3. Size: rank by how close their annual revenue (SEC XBRL "frames" API) is to the target's.
 */

/** Companies on an EDGAR "browse by SIC" page (CIK, name). */
export function parseSicListing(html: string): { cik: number; name: string }[] {
  const out: { cik: number; name: string }[] = [];
  for (const r of tableRows(html)) {
    if (r.length >= 2 && /^\d{10}$/.test(r[0]) && r[1]) out.push({ cik: Number(r[0]), name: r[1] });
  }
  return out;
}

export interface SecFrame {
  data?: { cik: number; entityName?: string; val: number; end?: string; accn?: string }[];
}

/** Annual revenue per CIK (USD) from one or more XBRL frames; the largest value wins across concepts. */
export function frameRevenue(frames: SecFrame[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const f of frames) {
    for (const d of f.data ?? []) {
      if (!(d.val > 0)) continue;
      if (!(out.get(d.cik)! >= d.val)) out.set(d.cik, d.val);
    }
  }
  return out;
}

export interface PeerCandidate {
  cik: number;
  ticker: string;
  name: string;
  /** Annual revenue, USD. */
  revenue: number;
  /** SIC code the company was listed under. */
  sic: string;
}

/**
 * Listed companies from the SIC member list, closest in revenue to the target first
 * (distance on a log scale, so $2B vs $1B counts the same as $1B vs $0.5B).
 */
export function rankPeers(opts: {
  members: { cik: number; name: string; sic: string }[];
  revenueByCik: Map<number, number>;
  tickerByCik: Map<number, string>;
  excludeCiks: Set<number>;
  /** Target revenue, USD. */
  targetRevenue: number;
}): PeerCandidate[] {
  const seen = new Set<number>();
  const out: PeerCandidate[] = [];
  for (const m of opts.members) {
    if (seen.has(m.cik) || opts.excludeCiks.has(m.cik)) continue;
    seen.add(m.cik);
    const ticker = opts.tickerByCik.get(m.cik);
    const revenue = opts.revenueByCik.get(m.cik);
    if (!ticker || !revenue) continue;
    out.push({ cik: m.cik, ticker, name: m.name, revenue, sic: m.sic });
  }
  const t = opts.targetRevenue;
  const dist = (r: number) => (t > 0 ? Math.abs(Math.log(r / t)) : -r);
  return out.sort((a, b) => dist(a.revenue) - dist(b.revenue));
}

// Multiples outside these bounds are "not meaningful" (shown as NM and left out of the statistics),
// the usual comps convention for near-zero or negative earnings.
const MAX = { evRevenue: 50, evEbitda: 100, pe: 100 };
export const meaningful = (key: keyof typeof MAX, v: number) => Number.isFinite(v) && v > 0 && v <= MAX[key];

/** A comparable from the same company data the app loads for the target and acquirer. */
export function toPeer(c: CompanyData, why: string, sic?: string): Peer {
  const ev = c.marketCap + c.netDebt;
  return {
    ticker: c.ticker,
    name: c.name,
    sic,
    currency: c.currency,
    price: c.currentPrice,
    marketCap: c.marketCap,
    netDebt: c.netDebt,
    revenue: c.revenue,
    ebitda: c.ebitda,
    netIncome: c.netIncome,
    evRevenue: c.revenue > 0 ? ev / c.revenue : NaN,
    evEbitda: c.ebitda > 0 ? ev / c.ebitda : NaN,
    pe: c.netIncome > 0 ? c.marketCap / c.netIncome : NaN,
    period: c.fiscalYear,
    source: c.source?.provider ?? "unknown",
    filingUrl: c.citations?.revenue?.facts.find(f => f.url)?.url,
    why,
    included: true,
  };
}

export interface CompsStat {
  n: number;
  q1: number;
  median: number;
  q3: number;
}

/** 25th percentile, median and 75th percentile of a multiple over the included peers (NM values left out). */
export function compsStats(peers: Peer[], key: "evRevenue" | "evEbitda" | "pe"): CompsStat | undefined {
  const v = peers.filter(p => p.included).map(p => p[key]).filter(x => meaningful(key, x));
  if (!v.length) return undefined;
  return { n: v.length, q1: percentile(v, 0.25), median: percentile(v, 0.5), q3: percentile(v, 0.75) };
}

/** Target price per share implied by a peer multiple. P/E applies to net income; EV multiples subtract net debt. */
export function impliedPrice(
  key: "evRevenue" | "evEbitda" | "pe",
  multiple: number,
  t: Pick<CompanyData, "revenue" | "ebitda" | "netIncome" | "netDebt" | "sharesOutstanding">,
): number {
  if (!(t.sharesOutstanding > 0)) return NaN;
  if (key === "pe") return t.netIncome > 0 ? (multiple * t.netIncome) / t.sharesOutstanding : NaN;
  const metric = key === "evRevenue" ? t.revenue : t.ebitda;
  return metric > 0 ? (multiple * metric - t.netDebt) / t.sharesOutstanding : NaN;
}

/** Response of GET /api/peers/:ticker. */
export interface PeersResult extends PeerSearchInfo {
  peers: Peer[];
}
