import { Peer } from "../src/types";
import { frameRevenue, parseSicListing, PeerCandidate, PeersResult, rankPeers, SecFrame, toPeer } from "../src/lib/peers";
import { getCompany, getJson, MarketDataError, memo, request, SEC_TIMEOUT, secHeaders, secTickerMap, submissions } from "./marketService";

/**
 * Trading comparables for a US-listed target, picked from SEC data:
 * same SIC code (EDGAR company list) → listed (company_tickers.json) → closest annual revenue (XBRL frames).
 * Each peer's figures are then loaded exactly like the target's (SEC filings + live price).
 */

export const sicUrl = (sic: string, start = 0) =>
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&SIC=${sic}&owner=include&count=100&start=${start}`;
export const frameUrl = (concept: string, year: number) => `https://data.sec.gov/api/xbrl/frames/us-gaap/${concept}/USD/CY${year}.json`;
const FRAME_CONCEPTS = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"];

/** Every company EDGAR lists under a SIC code (100 per page, capped). */
function sicMembers(sic: string, maxPages: number) {
  return memo(`sec:sic:${sic}:${maxPages}`, 24 * 3600_000, async () => {
    const out: { cik: number; name: string }[] = [];
    for (let page = 0; page < maxPages; page++) {
      const res = await request(sicUrl(sic, page * 100), { ...secHeaders(), Accept: "text/html" }, true, SEC_TIMEOUT);
      if (!res.ok) throw new MarketDataError(res.status, `www.sec.gov returned HTTP ${res.status} for the SIC ${sic} company list`);
      const rows = parseSicListing(await res.text());
      out.push(...rows);
      if (rows.length < 100) break;
    }
    return out;
  });
}

/** Annual revenue per CIK from the XBRL frames API, for the latest calendar year that is fully reported. */
function revenueFrames(now: Date) {
  return memo(`sec:frames:${now.getUTCFullYear()}`, 24 * 3600_000, async () => {
    const errors: string[] = [];
    for (const year of [now.getUTCFullYear() - 1, now.getUTCFullYear() - 2]) {
      const got = await Promise.allSettled(
        FRAME_CONCEPTS.map(c => getJson(frameUrl(c, year), secHeaders(), SEC_TIMEOUT) as Promise<SecFrame>),
      );
      const frames = got.flatMap(g => (g.status === "fulfilled" ? [g.value] : []));
      got.forEach(g => g.status === "rejected" && errors.push(g.reason?.message));
      const rows = frames.reduce((n, f) => n + (f.data?.length ?? 0), 0);
      // Early in the year most companies haven't filed last year's 10-K yet: use the year before.
      if (rows >= 1500) return { byCik: frameRevenue(frames), year };
    }
    throw new MarketDataError(502, `SEC revenue data (XBRL frames) unavailable${errors.length ? `: ${errors[0]}` : ""}`);
  });
}

const usd = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);

export async function getPeers(ticker: string, exclude: string[] = [], n = 6, now = new Date()): Promise<PeersResult> {
  const map = await secTickerMap();
  const find = (t: string) => map.get(t) ?? map.get(t.replace("-", "."));
  const cik = find(ticker);
  if (!cik) throw new MarketDataError(404, `${ticker} is not an SEC filer, so peers can't be picked by SIC code. Add peers by ticker instead.`);
  const subs = await submissions(cik);
  const sic = subs.sic && subs.sic !== "0000" ? subs.sic : undefined;
  if (!sic) throw new MarketDataError(404, `${ticker} has no SIC industry code on file with the SEC. Add peers by ticker instead.`);

  const [members, revenue] = await Promise.all([sicMembers(sic, 15), revenueFrames(now)]);
  const tickerByCik = new Map<number, string>();
  // company_tickers.json lists each company's main share class first.
  for (const [t, c] of map) if (!tickerByCik.has(c)) tickerByCik.set(c, t);
  const excludeCiks = new Set([cik, ...exclude.map(find).filter((c): c is number => !!c)]);
  const targetRevenue = revenue.byCik.get(cik) ?? 0;
  const dist = (r: number) => (targetRevenue > 0 ? Math.abs(Math.log(r / targetRevenue)) : -r);
  const rank = (ms: { cik: number; name: string }[], code: string) =>
    rankPeers({ members: ms.map(m => ({ ...m, sic: code })), revenueByCik: revenue.byCik, tickerByCik, excludeCiks, targetRevenue });

  let ranked: PeerCandidate[] = rank(members, sic);
  let widened = false;
  if (ranked.length < n) {
    // Too few in the exact code: add the other codes in the same 3-digit industry group.
    widened = true;
    ranked.forEach(r => excludeCiks.add(r.cik));
    const codes = Array.from({ length: 10 }, (_, d) => `${sic.slice(0, 3)}${d}`).filter(c => c !== sic);
    const lists = await Promise.allSettled(codes.map(c => sicMembers(c, 3)));
    const seen = new Set<number>();
    const more = lists
      .flatMap((l, i) => (l.status === "fulfilled" ? rank(l.value, codes[i]) : []))
      .filter(m => !seen.has(m.cik) && !!seen.add(m.cik))
      .sort((a, b) => dist(a.revenue) - dist(b.revenue));
    ranked = ranked.concat(more);
  }

  const why = (c: PeerCandidate) =>
    `${c.sic === sic ? `Same SIC code ${sic}` : `Related SIC code ${c.sic} (same industry group)`}; ` +
    `CY${revenue.year} revenue ${usd(c.revenue)}${targetRevenue ? ` vs the target's ${usd(targetRevenue)}` : ""}.`;

  // Load peers closest in size first, a few at a time (the SEC allows 10 requests a second).
  const found: { rank: number; peer: Peer }[] = [];
  const skipped: string[] = [];
  const limit = Math.min(ranked.length, n * 3);
  let next = 0;
  const worker = async () => {
    while (found.length < n && next < limit) {
      const i = next++;
      const c = ranked[i];
      try {
        found.push({ rank: i, peer: toPeer(await getCompany(c.ticker), why(c), c.sic) });
      } catch (e: any) {
        skipped.push(`${c.ticker}: ${String(e?.message ?? e).slice(0, 120)}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  return {
    ticker,
    sic,
    sicDescription: subs.sicDescription,
    peers: found.sort((a, b) => a.rank - b.rank).slice(0, n).map(f => f.peer),
    candidates: ranked.length,
    widened,
    revenueYear: revenue.year,
    skipped,
    sources: [
      { label: `EDGAR companies with SIC ${sic}`, url: sicUrl(sic) },
      { label: `SEC XBRL frames: CY${revenue.year} revenue`, url: frameUrl("Revenues", revenue.year) },
      { label: "SEC ticker list", url: "https://www.sec.gov/files/company_tickers.json" },
    ],
  };
}
