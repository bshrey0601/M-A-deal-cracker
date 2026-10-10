import YahooFinance from "yahoo-finance2";
import { CompanyData } from "../src/types";
import { mapYahooToCompany } from "../src/lib/marketData";
import { mapSecToCompany, SecCompanyFacts, SecSubmissions } from "../src/lib/secFacts";
import { Quote, parseYahooChart, parseStooqCsv, parseFinnhubQuote, stooqSymbol } from "../src/lib/quote";

/**
 * Market data with fallbacks, so one provider blocking the server doesn't break the app.
 *
 *   Financials: SEC EDGAR filings (US-listed companies, no key)  ->  Yahoo Finance quoteSummary
 *   Price:      Yahoo chart API (no crumb)  ->  Stooq (US, no key)  ->  Finnhub (US, FINNHUB_API_KEY)
 *
 * Every number shown comes from one of these sources and is labelled with it; nothing is estimated.
 */

export class MarketDataError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
// The SEC asks automated clients to identify themselves: "Name contact@email".
const secUserAgent = () =>
  process.env.SEC_USER_AGENT?.trim() || "M&A Deal Cracker (https://github.com/bshrey0601/M-A-deal-cracker)";

// ---------- small TTL cache with in-flight de-duplication ----------
const cache = new Map<string, { exp: number; value: Promise<any> }>();
function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = fn();
  const entry = { exp: Date.now() + ttlMs, value };
  cache.set(key, entry);
  value.catch(() => cache.get(key) === entry && cache.delete(key)); // never cache failures
  return value;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** fetch with a timeout and one polite retry on 429 / 5xx. */
async function request(url: string, headers: Record<string, string>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await sleep(1200 + Math.random() * 800);
      continue;
    }
    return res;
  }
}

async function getJson(url: string, headers: Record<string, string>) {
  const res = await request(url, { Accept: "application/json", ...headers });
  if (!res.ok) throw new MarketDataError(res.status, `${new URL(url).host} returned HTTP ${res.status}`);
  return res.json();
}

// ---------- prices ----------
const isUsTicker = (t: string) => /^[A-Z][A-Z0-9-]{0,9}$/.test(t);

async function yahooChartQuote(symbol: string): Promise<Quote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const res = await request(url, { "User-Agent": BROWSER_UA, Accept: "application/json" });
  if (res.status === 404) throw new MarketDataError(404, `Yahoo Finance has no symbol "${symbol}"`);
  if (!res.ok) throw new MarketDataError(res.status, `Yahoo Finance returned HTTP ${res.status}`);
  const q = parseYahooChart(await res.json());
  if (!q) throw new MarketDataError(404, `Yahoo Finance has no price for "${symbol}"`);
  return q;
}

async function stooqQuote(symbol: string): Promise<Quote> {
  const s = stooqSymbol(symbol);
  if (!s) throw new MarketDataError(404, "Stooq covers US tickers only");
  const res = await request(`https://stooq.com/q/l/?s=${s}&f=sd2t2ohlcvn&h&e=csv`, { "User-Agent": BROWSER_UA });
  if (!res.ok) throw new MarketDataError(res.status, `Stooq returned HTTP ${res.status}`);
  const q = parseStooqCsv(await res.text());
  if (!q) throw new MarketDataError(404, `Stooq has no price for "${symbol}"`);
  return q;
}

async function finnhubQuote(symbol: string): Promise<Quote> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) throw new MarketDataError(503, "FINNHUB_API_KEY not set");
  if (!isUsTicker(symbol)) throw new MarketDataError(404, "Finnhub free tier covers US tickers only");
  const q = parseFinnhubQuote(
    await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol.replace("-", "."))}&token=${key}`, {}),
  );
  if (!q) throw new MarketDataError(404, `Finnhub has no price for "${symbol}"`);
  return q;
}

export function getQuote(symbol: string): Promise<Quote> {
  return memo(`quote:${symbol}`, 60_000, async () => {
    const errors: string[] = [];
    for (const source of [yahooChartQuote, stooqQuote, finnhubQuote]) {
      try {
        return await source(symbol);
      } catch (e: any) {
        errors.push(e.message);
      }
    }
    const notFound = errors.every(m => /no symbol|no price|covers US|not set/i.test(m));
    throw new MarketDataError(notFound ? 404 : 502, `No price available for "${symbol}" (${errors.join("; ")})`);
  });
}

// ---------- SEC EDGAR ----------
const secHeaders = () => ({ "User-Agent": secUserAgent(), Accept: "application/json" });

const secTickerMap = () =>
  memo("sec:tickers", 24 * 3600_000, async () => {
    const json = await getJson("https://www.sec.gov/files/company_tickers.json", secHeaders());
    const map = new Map<string, number>();
    for (const row of Object.values<any>(json)) map.set(String(row.ticker).toUpperCase(), row.cik_str);
    return map;
  });

const pad = (cik: number) => String(cik).padStart(10, "0");
const companyFacts = (cik: number) =>
  memo<SecCompanyFacts>(`sec:facts:${cik}`, 6 * 3600_000, () =>
    getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad(cik)}.json`, secHeaders()),
  );
const submissions = (cik: number) =>
  memo<SecSubmissions>(`sec:subs:${cik}`, 24 * 3600_000, () =>
    getJson(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`, secHeaders()),
  );

async function secCompany(ticker: string): Promise<CompanyData | null> {
  if (!isUsTicker(ticker)) return null;
  const map = await secTickerMap();
  const cik = map.get(ticker) ?? map.get(ticker.replace("-", "."));
  if (!cik) return null;
  const [facts, subs, quote] = await Promise.all([
    companyFacts(cik),
    submissions(cik).catch(() => undefined),
    getQuote(ticker),
  ]);
  return mapSecToCompany(ticker, facts, subs, quote);
}

// ---------- Yahoo quoteSummary (non-US companies, and fallback) ----------
const SUMMARY_MODULES = ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"] as const;
let yahooCooldownUntil = 0;

async function fxRate(from: string, to: string): Promise<number> {
  const norm = (c: string) => (c === "GBp" ? "GBP" : c);
  const scale = (to === "GBp" ? 100 : 1) / (from === "GBp" ? 100 : 1);
  if (norm(from) === norm(to)) return scale;
  const q = await yahooChartQuote(`${norm(from)}${norm(to)}=X`);
  return q.price * scale;
}

async function yahooCompany(ticker: string): Promise<CompanyData> {
  const wait = yahooCooldownUntil - Date.now();
  if (wait > 0) {
    throw new MarketDataError(503, `Yahoo Finance is blocking requests from this server; retry in about ${Math.ceil(wait / 60_000)} min`);
  }
  try {
    const summary: any = await yahoo.quoteSummary(ticker, { modules: [...SUMMARY_MODULES] }, { validateResult: false });
    if (!summary?.price?.regularMarketPrice) throw new MarketDataError(404, `Yahoo Finance has no data for "${ticker}"`);

    const period1 = new Date();
    period1.setUTCFullYear(period1.getUTCFullYear() - 3);
    const annual: any[] = await yahoo
      .fundamentalsTimeSeries(ticker, { period1, type: "annual", module: "all" }, { validateResult: false })
      .catch(() => []);

    const tradeCcy = summary.price.currency ?? "USD";
    const fx = await fxRate(summary.financialData?.financialCurrency ?? tradeCcy, tradeCcy);
    return mapYahooToCompany(ticker, { summary, annual, fx });
  } catch (e: any) {
    if (e instanceof MarketDataError) throw e;
    const msg = String(e?.message ?? e);
    // Cloud hosts' shared IPs often get 429s on Yahoo's cookie/crumb handshake. Back off instead of retrying.
    if (/429|Too Many Requests|crumb|set-cookie/i.test(msg)) {
      yahooCooldownUntil = Date.now() + 10 * 60_000;
      throw new MarketDataError(503, `Yahoo Finance is blocking requests from this server (${msg.slice(0, 80)})`);
    }
    if (/not found|No fundamentals/i.test(msg)) throw new MarketDataError(404, `Yahoo Finance has no data for "${ticker}"`);
    throw new MarketDataError(502, `Yahoo Finance: ${msg}`);
  }
}

// ---------- entry point ----------
export function getCompany(ticker: string): Promise<CompanyData> {
  return memo(`company:${ticker}`, 5 * 60_000, async () => {
    const errors: string[] = [];
    let notFound = 0;
    try {
      const sec = await secCompany(ticker);
      if (sec) return sec;
      notFound++;
    } catch (e: any) {
      errors.push(`SEC EDGAR: ${e.message}`);
    }
    try {
      return await yahooCompany(ticker);
    } catch (e: any) {
      if (e instanceof MarketDataError && e.status === 404) notFound++;
      errors.push(e.message);
    }
    if (notFound === 2) {
      throw new MarketDataError(404, `No market data found for "${ticker}". Check the symbol (e.g. RELIANCE.NS for NSE, 7203.T for Tokyo).`);
    }
    throw new MarketDataError(502, `Live data for "${ticker}" is temporarily unavailable: ${errors.join(" · ")}`);
  });
}
