import YahooFinance from "yahoo-finance2";
import { CompanyData } from "../src/types";
import { mapYahooToCompany } from "../src/lib/marketData";
import { mapSecToCompany, SecCompanyFacts, SecSubmissions } from "../src/lib/secFacts";
import { secondSourceCheck } from "../src/lib/accuracyChecks";
import { Quote, parseYahooChart, parseStooqCsv, parseFinnhubQuote, parseCnbcQuote, stooqSymbol } from "../src/lib/quote";

/**
 * Market data with fallbacks, so one provider blocking the server doesn't break the app.
 *
 *   Financials: SEC EDGAR filings (US-listed companies, no key)  ->  Yahoo Finance quoteSummary
 *   Price:      Finnhub (US, if FINNHUB_API_KEY is set)  ->  Yahoo chart API  ->  CNBC (US)  ->  Stooq (US)
 *
 * Every number shown comes from one of these sources and is labelled with it; nothing is estimated.
 */

export class MarketDataError extends Error {
  /** noFallback: the failure would repeat on every other source (e.g. no price anywhere). */
  constructor(
    public status: number,
    message: string,
    public noFallback = false,
    /** Financials loaded but no live price: the user can enter the share price to continue. */
    public needsPrice = false,
  ) {
    super(message);
  }
}

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
// The SEC asks automated clients to identify themselves: "Name contact@email".
// The SEC rejects (HTTP 403) clients without a contact email, so the default names the app's owner.
// Set SEC_USER_AGENT on your own deployment to use your own name and email instead.
export const DEFAULT_SEC_USER_AGENT = "Shrey Bhatt shrey.bhatt0601@gmail.com";
const secUserAgent = () => process.env.SEC_USER_AGENT?.trim() || DEFAULT_SEC_USER_AGENT;

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

/** fetch with a timeout and (unless retry is false) one polite retry on 429 / 5xx. */
async function request(url: string, headers: Record<string, string>, retry = true, timeoutMs = 10_000): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e: any) {
      const why = e?.name === "TimeoutError" ? `timed out after ${timeoutMs / 1000}s` : (e?.cause?.code ?? e?.name ?? "network error");
      throw new MarketDataError(502, `${new URL(url).host} could not be reached (${why})`);
    }
    if (retry && (res.status === 429 || res.status >= 500) && attempt === 0) {
      await sleep(1200 + Math.random() * 800);
      continue;
    }
    return res;
  }
}

async function getJson(url: string, headers: Record<string, string>, timeoutMs?: number) {
  const res = await request(url, { Accept: "application/json", ...headers }, true, timeoutMs);
  if (!res.ok) {
    const host = new URL(url).host;
    // The SEC refuses clients that don't identify themselves with a contact email.
    const hint =
      res.status === 403 && host.endsWith("sec.gov")
        ? ` (the SEC refused requests from this server; set SEC_USER_AGENT to "Your Name your@email.com"${process.env.SEC_USER_AGENT?.trim() ? " and check its value" : ""})`
        : "";
    throw new MarketDataError(res.status, `${host} returned HTTP ${res.status}${hint}`);
  }
  return res.json();
}

// ---------- prices ----------
const isUsTicker = (t: string) => /^[A-Z][A-Z0-9-]{0,9}$/.test(t);

// Yahoo blocks some cloud IPs outright (HTTP 429 on every endpoint). After a 429 we skip Yahoo
// for a while rather than hammering it, which only extends the block.
let yahooCooldownUntil = 0;
const YAHOO_COOLDOWN_MS = 10 * 60_000;
const yahooCoolingDown = () => yahooCooldownUntil > Date.now();
const coolYahoo = () => (yahooCooldownUntil = Date.now() + YAHOO_COOLDOWN_MS);

async function yahooChartQuote(symbol: string, { ignoreCooldown = false } = {}): Promise<Quote> {
  if (yahooCoolingDown() && !ignoreCooldown) throw new MarketDataError(503, "Yahoo Finance skipped (blocking this server, cooling down)");
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const res = await request(url, { "User-Agent": BROWSER_UA, Accept: "application/json" }, false);
  if (res.status === 429) {
    coolYahoo();
    throw new MarketDataError(503, "Yahoo Finance returned HTTP 429 (Too Many Requests)");
  }
  if (res.status === 404) throw new MarketDataError(404, `Yahoo Finance has no symbol "${symbol}"`);
  if (!res.ok) throw new MarketDataError(res.status, `Yahoo Finance returned HTTP ${res.status}`);
  const q = parseYahooChart(await res.json());
  if (!q) throw new MarketDataError(404, `Yahoo Finance has no price for "${symbol}"`);
  return q;
}

async function cnbcQuote(symbol: string): Promise<Quote> {
  if (!isUsTicker(symbol)) throw new MarketDataError(404, "CNBC lookup covers US tickers only");
  const url =
    "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol" +
    `?symbols=${encodeURIComponent(symbol.replace("-", "."))}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`;
  const q = parseCnbcQuote(await getJson(url, { "User-Agent": BROWSER_UA }));
  if (!q) throw new MarketDataError(404, `CNBC has no price for "${symbol}"`);
  return q;
}

async function stooqQuote(symbol: string): Promise<Quote> {
  const s = stooqSymbol(symbol);
  if (!s) throw new MarketDataError(404, "Stooq covers US tickers only");
  const res = await request(`https://stooq.com/q/l/?s=${s}&f=sd2t2ohlcvn&h&e=csv`, { "User-Agent": BROWSER_UA });
  if (!res.ok) throw new MarketDataError(res.status, `Stooq returned HTTP ${res.status}`);
  const text = await res.text();
  const q = parseStooqCsv(text);
  if (!q && !/^symbol,/i.test(text.trim())) throw new MarketDataError(502, `Stooq returned an unexpected page ("${text.trim().slice(0, 60)}")`);
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
    const sources = [
      ...(process.env.FINNHUB_API_KEY?.trim() ? [finnhubQuote] : []),
      yahooChartQuote,
      cnbcQuote,
      stooqQuote,
    ];
    if (!process.env.FINNHUB_API_KEY?.trim()) errors.push("Finnhub not configured (FINNHUB_API_KEY)");
    for (const source of sources) {
      try {
        return await source(symbol);
      } catch (e: any) {
        errors.push(e.message);
      }
    }
    const notFound = errors.every(m => /no symbol|no price|covers US|not configured/i.test(m));
    throw new MarketDataError(notFound ? 404 : 502, `No price available for "${symbol}" (${errors.join("; ")})`);
  });
}

// ---------- SEC EDGAR ----------
const secHeaders = () => ({ "User-Agent": secUserAgent(), Accept: "application/json" });

const secTickerMap = () =>
  memo("sec:tickers", 24 * 3600_000, async () => {
    const json = await getJson("https://www.sec.gov/files/company_tickers.json", secHeaders(), SEC_TIMEOUT);
    const map = new Map<string, number>();
    for (const row of Object.values<any>(json)) map.set(String(row.ticker).toUpperCase(), row.cik_str);
    return map;
  });

// Company facts for large filers are several MB; give the SEC more time than a price quote.
const SEC_TIMEOUT = 30_000;
const pad = (cik: number) => String(cik).padStart(10, "0");
const companyFacts = (cik: number) =>
  memo<SecCompanyFacts>(`sec:facts:${cik}`, 6 * 3600_000, () =>
    getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad(cik)}.json`, secHeaders(), SEC_TIMEOUT),
  );
const submissions = (cik: number) =>
  memo<SecSubmissions>(`sec:subs:${cik}`, 24 * 3600_000, () =>
    getJson(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`, secHeaders(), SEC_TIMEOUT),
  );

/** A share price the user typed in (e.g. from their broker) when no live price source answers. */
export function manualQuote(price: number): Quote {
  return { provider: "entered by user", price, currency: "USD", time: new Date() };
}

async function secCompany(ticker: string, manualPrice?: number): Promise<CompanyData | null> {
  if (!isUsTicker(ticker)) return null;
  const map = await secTickerMap();
  const cik = map.get(ticker) ?? map.get(ticker.replace("-", "."));
  if (!cik) return null;
  const [facts, subs, quote] = await Promise.all([
    companyFacts(cik),
    submissions(cik).catch(() => undefined),
    manualPrice ? manualQuote(manualPrice) : getQuote(ticker).catch((e: Error) => e),
  ]);
  if (quote instanceof Error) {
    // Financials are fine; only the price is missing, and Yahoo's other endpoints would fail the same way.
    // The UI asks the user for the current share price and retries with it.
    throw new MarketDataError(
      502,
      `Financials for ${ticker} loaded from SEC filings, but no live price source answered. Enter the current share price to continue. ${quote.message.replace(/^No price available for "[^"]+" /, "")}`,
      true,
      true,
    );
  }
  const company = mapSecToCompany(ticker, facts, subs, quote);
  // Accuracy check against an independent provider. Best effort: never blocks the result.
  company.checks?.push(secondSourceCheck(company.revenue, await yahooRevenue(ticker)));
  return company;
}

/** Yahoo Finance's trailing-twelve-month revenue (USD millions), for the second-source check. */
function yahooRevenue(ticker: string): Promise<{ provider: string; revenueMn?: number; error?: string }> {
  const provider = "Yahoo Finance";
  if (yahooCoolingDown()) return Promise.resolve({ provider, error: "Yahoo is blocking this server right now" });
  return memo(`yahoo:rev:${ticker}`, 6 * 3600_000, async () => {
    const summary: any = await Promise.race([
      yahoo.quoteSummary(ticker, { modules: ["financialData"] }, { validateResult: false }),
      sleep(5000).then(() => {
        throw new Error("timed out");
      }),
    ]);
    const fd = summary?.financialData ?? {};
    const raw = typeof fd.totalRevenue === "object" ? fd.totalRevenue?.raw : fd.totalRevenue;
    if (fd.financialCurrency && fd.financialCurrency !== "USD") throw new Error(`reports in ${fd.financialCurrency}`);
    if (!(raw > 0)) throw new Error("no revenue figure");
    return { provider, revenueMn: raw / 1e6 };
  }).catch((e: any) => {
    const msg = String(e?.message ?? e);
    if (/429|Too Many Requests|crumb|set-cookie/i.test(msg)) coolYahoo();
    return { provider, error: msg.slice(0, 80) };
  });
}

// ---------- Yahoo quoteSummary (non-US companies, and fallback) ----------
const SUMMARY_MODULES = ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"] as const;
async function fxRate(from: string, to: string): Promise<number> {
  const norm = (c: string) => (c === "GBp" ? "GBP" : c);
  const scale = (to === "GBp" ? 100 : 1) / (from === "GBp" ? 100 : 1);
  if (norm(from) === norm(to)) return scale;
  const q = await yahooChartQuote(`${norm(from)}${norm(to)}=X`);
  return q.price * scale;
}

async function yahooCompany(ticker: string): Promise<CompanyData> {
  const wait = yahooCooldownUntil - Date.now();
  if (yahooCoolingDown()) {
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
      coolYahoo();
      throw new MarketDataError(503, `Yahoo Finance is blocking requests from this server (${msg.slice(0, 80)})`);
    }
    if (/not found|No fundamentals/i.test(msg)) throw new MarketDataError(404, `Yahoo Finance has no data for "${ticker}"`);
    throw new MarketDataError(502, `Yahoo Finance: ${msg}`);
  }
}

// ---------- entry point ----------
export function getCompany(ticker: string, manualPrice?: number): Promise<CompanyData> {
  return memo(`company:${ticker}:${manualPrice ?? "live"}`, 5 * 60_000, async () => {
    const errors: string[] = [];
    let notFound = 0;
    try {
      const sec = await secCompany(ticker, manualPrice);
      if (sec) return sec;
      notFound++;
    } catch (e: any) {
      if (e instanceof MarketDataError && e.noFallback) throw e;
      errors.push(`SEC EDGAR: ${e.message}`);
    }
    try {
      const y = await yahooCompany(ticker);
      if (errors.length && y.source) {
        // A US filer whose SEC filings failed: say so plainly instead of silently showing Yahoo figures.
        const reason = errors[0].replace(/^SEC EDGAR: /, "");
        console.error(`SEC EDGAR failed for ${ticker}, using Yahoo Finance: ${reason}`);
        y.source.secUnavailable = reason;
        y.source.warnings.unshift(`Official SEC filings could not be loaded (${reason}), so these figures are from Yahoo Finance and are not linked to filings.`);
      }
      return y;
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

// ---------- diagnostics (GET /api/diagnostics) ----------
/** Probes every source once, uncached, so a deployment can show which providers it can reach. */
export async function diagnostics() {
  const probe = async (fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      return { ok: true, detail: await fn(), ms: Date.now() - t0 };
    } catch (e: any) {
      return { ok: false, detail: String(e?.message ?? e), ms: Date.now() - t0 };
    }
  };
  const price = (q: Quote) => `AAPL ${q.price} ${q.currency}`;
  const [sec, yahooChart, cnbc, stooq, finnhub] = await Promise.all([
    probe(async () => {
      const map = await secTickerMap(); // www.sec.gov
      const subs = await getJson("https://data.sec.gov/submissions/CIK0000320193.json", secHeaders(), SEC_TIMEOUT);
      const facts = await companyFacts(320193);
      const n = Object.keys(facts?.facts?.["us-gaap"] ?? {}).length;
      return `reached www.sec.gov (${map.size} tickers) and data.sec.gov (${subs?.name ?? "?"}, ${n} filed line items)`;
    }),
    probe(async () => price(await yahooChartQuote("AAPL", { ignoreCooldown: true }))),
    probe(async () => price(await cnbcQuote("AAPL"))),
    probe(async () => price(await stooqQuote("AAPL"))),
    probe(async () => price(await finnhubQuote("AAPL"))),
  ]);
  return {
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
    secUserAgentSet: Boolean(process.env.SEC_USER_AGENT?.trim()),
    finnhubKeySet: Boolean(process.env.FINNHUB_API_KEY?.trim()),
    yahooCoolingDown: yahooCoolingDown(),
    sources: { "SEC EDGAR (financials)": sec, "Yahoo chart (price)": yahooChart, "CNBC (price)": cnbc, "Stooq (price)": stooq, "Finnhub (price)": finnhub },
  };
}
