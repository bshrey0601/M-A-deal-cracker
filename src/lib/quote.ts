/** A last-traded price from one of the quote providers. Pure parsers, no network. */
export interface Quote {
  provider: string;
  price: number;
  currency: string;
  /** Exchange timestamp of the price, when the provider reports it. */
  time?: Date;
  name?: string;
  exchange?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

const pos = (v: unknown): number | undefined => (typeof v === "number" && isFinite(v) && v > 0 ? v : undefined);

/** Yahoo v8 chart endpoint (no cookie/crumb needed, unlike quoteSummary). */
export function parseYahooChart(json: any): Quote | null {
  const meta = json?.chart?.result?.[0]?.meta;
  const price = pos(meta?.regularMarketPrice);
  if (!meta || price === undefined) return null;
  return {
    provider: "Yahoo Finance",
    price,
    currency: meta.currency ?? "USD",
    time: typeof meta.regularMarketTime === "number" ? new Date(meta.regularMarketTime * 1000) : undefined,
    name: meta.longName ?? meta.shortName,
    exchange: meta.fullExchangeName ?? meta.exchangeName,
    fiftyTwoWeekHigh: pos(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: pos(meta.fiftyTwoWeekLow),
  };
}

/** Stooq's ticker for a US listing: MSFT -> msft.us, BRK-B -> brk-b.us. Null for non-US tickers. */
export function stooqSymbol(ticker: string): string | null {
  return /^[A-Z][A-Z0-9-]{0,9}$/.test(ticker) ? `${ticker.toLowerCase()}.us` : null;
}

/** Stooq CSV quote: header "Symbol,Date,Time,Open,High,Low,Close,Volume[,Name]", "N/D" when unknown. */
export function parseStooqCsv(csv: string): Quote | null {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const head = lines[0].split(",").map(h => h.trim().toLowerCase());
  const row = lines[1].split(",");
  const get = (k: string) => row[head.indexOf(k)]?.trim();
  const price = pos(Number(get("close")));
  if (price === undefined) return null;
  // Stooq's time column is exchange-agnostic local time, so keep only the trading date.
  const date = get("date");
  const when = date && date !== "N/D" ? new Date(`${date}T00:00:00Z`) : undefined;
  const name = get("name");
  return {
    provider: "Stooq",
    price,
    currency: "USD",
    time: when && !isNaN(when.getTime()) ? when : undefined,
    name: name && name !== "N/D" ? name : undefined,
  };
}

/** Finnhub /quote: { c: current, t: unix seconds }; c is 0 for unknown symbols. */
export function parseFinnhubQuote(json: any): Quote | null {
  const price = pos(json?.c);
  if (price === undefined) return null;
  return {
    provider: "Finnhub",
    price,
    currency: "USD",
    time: typeof json.t === "number" && json.t > 0 ? new Date(json.t * 1000) : undefined,
  };
}
