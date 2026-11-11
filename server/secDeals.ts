import { PrecedentDeal } from "../src/types";
import { mapSecToCompany } from "../src/lib/secFacts";
import {
  extractAcquirer, extractOffer, extractPremium, factsAsOf, FilingHit, filingDocUrl, htmlToText, parseEftsHits, toPrecedent,
} from "../src/lib/secDeals";
import { companyFacts, getJson, MarketDataError, memo, request, SEC_TIMEOUT, secHeaders, secTickerMap, submissions } from "./marketService";

/**
 * Live precedent transactions from SEC merger filings, for the target's industry.
 *
 *   1. EDGAR full-text search: merger proxies (DEFM14A) and tender-offer responses (SC 14D9)
 *      from the last three years, filed by companies in the target's 2-digit SIC group.
 *   2. Each filing's text gives the offer price per share and the premium, quoted.
 *   3. The acquired company's own XBRL facts, as filed before that date, give revenue, EBITDA,
 *      net debt and shares; valued at the offer price they give EV/Revenue and EV/EBITDA.
 */

const FORMS = ["DEFM14A", "SC 14D9"];
export const eftsUrl = (form: string, start: string, end: string, from = 0) =>
  `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent('"per share"')}&forms=${encodeURIComponent(form)}&dateRange=custom&startdt=${start}&enddt=${end}&from=${from}`;

/** All merger filings of the given forms over a period (100 hits per page, capped). */
function mergerFilings(start: string, end: string, pages = 6) {
  return memo(`sec:efts:${start}:${end}`, 24 * 3600_000, async () => {
    const out: FilingHit[] = [];
    for (const form of FORMS) {
      for (let page = 0; page < pages; page++) {
        const hits = parseEftsHits(await getJson(eftsUrl(form, start, end, page * 100), secHeaders(), SEC_TIMEOUT));
        out.push(...hits);
        if (hits.length < 100) break;
      }
    }
    return out;
  });
}

/** The main document's text (first ~1.5 MB: the summary with price and premium comes first). */
function filingText(h: FilingHit) {
  return memo(`sec:doc:${h.adsh}`, 7 * 24 * 3600_000, async () => {
    const res = await request(filingDocUrl(h), { ...secHeaders(), Accept: "text/html" }, true, SEC_TIMEOUT);
    if (!res.ok) throw new MarketDataError(res.status, `www.sec.gov returned HTTP ${res.status} for the filing`);
    return htmlToText((await res.text()).slice(0, 1_500_000));
  });
}

export interface SecPrecedentsResult {
  sic: string;
  sicDescription?: string;
  deals: PrecedentDeal[];
  /** Filings looked at but left out, with the reason. */
  skipped: string[];
  /** Merger filings found in the industry group before the cap. */
  found: number;
  sources: { label: string; url: string }[];
}

export async function getSecPrecedents(ticker: string, max = 10, now = new Date()): Promise<SecPrecedentsResult> {
  const map = await secTickerMap();
  const cik = map.get(ticker) ?? map.get(ticker.replace("-", "."));
  if (!cik) throw new MarketDataError(404, `${ticker} is not an SEC filer, so its industry can't be matched to SEC merger filings.`);
  const subs = await submissions(cik);
  const sic = subs.sic && subs.sic !== "0000" ? subs.sic : undefined;
  if (!sic) throw new MarketDataError(404, `${ticker} has no SIC industry code on file with the SEC.`);

  const end = now.toISOString().slice(0, 10);
  const startDate = new Date(now);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 3);
  const start = startDate.toISOString().slice(0, 10);
  const all = await mergerFilings(start, end);

  // Same 2-digit SIC major group; exact code first, newest first; one filing per company (the latest).
  const group = sic.slice(0, 2);
  const byCik = new Map<number, FilingHit>();
  for (const h of all) {
    if (h.cik === cik || !h.sics.some(s => s.startsWith(group))) continue;
    const prev = byCik.get(h.cik);
    if (!prev || h.filed > prev.filed) byCik.set(h.cik, h);
  }
  const candidates = [...byCik.values()].sort(
    (a, b) => Number(b.sics.includes(sic)) - Number(a.sics.includes(sic)) || b.filed.localeCompare(a.filed),
  );

  const deals: { i: number; deal: PrecedentDeal }[] = [];
  const skipped: string[] = [];
  const limit = Math.min(candidates.length, max * 3);
  let next = 0;
  const worker = async () => {
    while (deals.length < max && next < limit) {
      const i = next++;
      const h = candidates[i];
      const label = `${h.name} (${h.form}, ${h.filed})`;
      try {
        const text = await filingText(h);
        const offer = extractOffer(text);
        if (!offer) throw new Error("no per-share offer price found in the filing text");
        const facts = factsAsOf(await companyFacts(h.cik), h.filed);
        const target = mapSecToCompany(h.ticker ?? h.name, facts, undefined, { provider: `${h.form} offer price`, price: offer.value, currency: "USD", time: new Date(h.filed) }, new Date(h.filed));
        if (!(target.marketCap > 0)) throw new Error("no share count filed before the deal");
        deals.push({ i, deal: toPrecedent(target, h, offer, extractPremium(text), extractAcquirer(text, h.name)) });
      } catch (e: any) {
        skipped.push(`${label}: ${String(e?.message ?? e).slice(0, 120)}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  return {
    sic,
    sicDescription: subs.sicDescription,
    deals: deals.sort((a, b) => a.i - b.i).slice(0, max).map(d => d.deal),
    skipped,
    found: candidates.length,
    sources: [
      { label: `EDGAR full-text search: DEFM14A merger proxies, ${start} to ${end}`, url: eftsUrl("DEFM14A", start, end) },
      { label: `EDGAR full-text search: SC 14D9 tender-offer responses, ${start} to ${end}`, url: eftsUrl("SC 14D9", start, end) },
    ],
  };
}
