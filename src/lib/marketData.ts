import { CompanyData } from "../types";

/**
 * Maps raw Yahoo Finance responses (quoteSummary + annual fundamentalsTimeSeries)
 * onto the app's CompanyData shape. Pure so it can be unit tested without network.
 *
 * Units: Yahoo reports absolute amounts; the app works in millions.
 * Fundamentals are reported in `financialCurrency`, which can differ from the
 * trading currency (e.g. ADRs). `fx` converts financial -> trading currency.
 */

const M = 1e6;

const num = (v: unknown): number | undefined => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in (v as any)) return num((v as any).raw);
  return undefined;
};

/** Accepts Date, ISO string, or epoch seconds/ms (Yahoo returns epoch seconds when unvalidated). */
const toDate = (v: unknown): Date | undefined => {
  if (v === undefined || v === null) return undefined;
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v as any);
  return isNaN(d.getTime()) ? undefined : d;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", INR: "₹", GBP: "£", GBp: "p", EUR: "€", JPY: "¥", CNY: "¥", HKD: "HK$",
  CAD: "C$", AUD: "A$", SGD: "S$", KRW: "₩", BRL: "R$", CHF: "CHF ", AED: "AED ", TWD: "NT$",
};

export interface YahooRaw {
  summary: any;
  /** Annual rows from fundamentalsTimeSeries(module: "all"), any order. */
  annual?: any[];
  /** Rate to convert financialCurrency amounts into the trading currency (1 if same). */
  fx?: number;
}

export function mapYahooToCompany(ticker: string, raw: YahooRaw): CompanyData {
  const s = raw.summary ?? {};
  const price = s.price ?? {};
  const sd = s.summaryDetail ?? {};
  const ks = s.defaultKeyStatistics ?? {};
  const fd = s.financialData ?? {};
  const ap = s.assetProfile ?? s.summaryProfile ?? {};
  const fx = raw.fx ?? 1;
  const warnings: string[] = [];

  const currentPrice = num(price.regularMarketPrice) ?? num(fd.currentPrice);
  if (currentPrice === undefined) throw new Error(`No market price returned for ${ticker}`);

  const tradeCcy: string = price.currency ?? sd.currency ?? "USD";
  const finCcy: string = fd.financialCurrency ?? tradeCcy;
  if (finCcy !== tradeCcy) {
    warnings.push(`Financials reported in ${finCcy}; converted to ${tradeCcy} at ${fx.toFixed(4)}.`);
  }
  if (tradeCcy === "GBp") warnings.push("Quoted in pence (GBp); per-share values are in pence.");

  // Most recent annual statement row (for D&A and CapEx, which quoteSummary lacks).
  const annual = [...(raw.annual ?? [])]
    .filter(r => r && toDate(r.date))
    .sort((a, b) => toDate(b.date)!.getTime() - toDate(a.date)!.getTime());
  const pick = (k: string) => {
    for (const r of annual) {
      const v = num(r[k]);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  const fin = (v: number | undefined) => (v === undefined ? undefined : (v * fx) / M);

  const marketCapRaw = num(price.marketCap) ?? num(sd.marketCap);
  const shares =
    (num(ks.impliedSharesOutstanding) ?? num(ks.sharesOutstanding) ??
      (marketCapRaw !== undefined ? marketCapRaw / currentPrice : undefined)) ?? 0;
  const sharesMn = shares / M;
  const marketCap = marketCapRaw !== undefined ? marketCapRaw / M : sharesMn * currentPrice;

  const revenue = fin(num(fd.totalRevenue)) ?? fin(pick("totalRevenue")) ?? 0;
  const ebitda = fin(num(fd.ebitda)) ?? fin(pick("EBITDA") ?? pick("normalizedEBITDA")) ?? 0;
  const opMargin = num(fd.operatingMargins);
  const da = fin(pick("depreciationAndAmortization") ?? pick("reconciledDepreciation"));
  let ebit = opMargin !== undefined && revenue ? revenue * opMargin : fin(pick("EBIT") ?? pick("operatingIncome"));
  if (ebit === undefined && da !== undefined) ebit = ebitda - da;
  const capexRaw = pick("capitalExpenditure") ?? pick("purchaseOfPPE");
  const capex = capexRaw !== undefined ? Math.abs(fin(capexRaw)!) : undefined;
  const netIncome = fin(num(ks.netIncomeToCommon)) ?? fin(pick("netIncomeCommonStockholders") ?? pick("netIncome")) ?? 0;

  const totalDebt = num(fd.totalDebt);
  const totalCash = num(fd.totalCash);
  let netDebt = 0;
  if (totalDebt !== undefined || totalCash !== undefined) {
    netDebt = fin((totalDebt ?? 0) - (totalCash ?? 0))!;
  } else {
    warnings.push("Debt and cash not reported; net debt set to 0.");
  }

  if (da === undefined) warnings.push("D&A not reported; DCF uses the default 5% of revenue.");
  if (capex === undefined) warnings.push("CapEx not reported; DCF uses the default 5% of revenue.");
  if (!revenue) warnings.push("Revenue not reported.");

  // EPS: Yahoo's trailingEps is in the financial currency for cross-listed names,
  // so derive it from converted net income in that case.
  const eps = finCcy === tradeCcy && num(ks.trailingEps) !== undefined
    ? num(ks.trailingEps)!
    : sharesMn ? netIncome / sharesMn : 0;
  const bvps = finCcy === tradeCcy ? num(ks.bookValue) ?? 0 : (num(ks.bookValue) ?? 0) * fx;

  const lastFY = toDate(ks.lastFiscalYearEnd);
  const summary: string = ap.longBusinessSummary ?? "";
  const firstSentence = summary.split(/(?<=\.)\s/)[0] ?? "";
  const ev = marketCap + netDebt;

  return {
    name: price.longName ?? price.shortName ?? ticker,
    ticker,
    sector: ap.sector ?? ap.industry ?? "Unclassified",
    currency: price.currencySymbol && price.currencySymbol !== tradeCcy ? price.currencySymbol : CURRENCY_SYMBOLS[tradeCcy] ?? `${tradeCcy} `,
    unit: "Mn",
    currentPrice,
    fiftyTwoWeekHigh: num(sd.fiftyTwoWeekHigh) ?? currentPrice,
    fiftyTwoWeekLow: num(sd.fiftyTwoWeekLow) ?? currentPrice,
    sharesOutstanding: sharesMn,
    marketCap,
    revenue,
    ebitda,
    ebit: ebit ?? 0,
    netIncome,
    eps,
    da: da ?? 0,
    capex: capex ?? 0,
    netDebt,
    bookValuePerShare: bvps,
    dividendPerShare: num(sd.dividendRate) ?? 0,
    peRatio: num(sd.trailingPE) ?? (eps > 0 ? currentPrice / eps : NaN),
    evEbitda: num(ks.enterpriseToEbitda) ?? (ebitda ? ev / ebitda : NaN),
    evRevenue: num(ks.enterpriseToRevenue) ?? (revenue ? ev / revenue : NaN),
    pbRatio: num(ks.priceToBook) ?? (bvps ? currentPrice / bvps : NaN),
    revenueGrowthYoY: (num(fd.revenueGrowth) ?? 0) * 100,
    ebitdaMargin: num(fd.ebitdaMargins) !== undefined ? num(fd.ebitdaMargins)! * 100 : revenue ? (ebitda / revenue) * 100 : 0,
    netMargin: num(fd.profitMargins) !== undefined ? num(fd.profitMargins)! * 100 : revenue ? (netIncome / revenue) * 100 : 0,
    fiscalYear: lastFY ? `FY${lastFY.getUTCFullYear()}` : "LTM",
    exchange: price.exchangeName ?? price.exchange ?? "",
    description: firstSentence || `${ticker} · ${ap.industry ?? ap.sector ?? ""}`,
    verifiedDA: da !== undefined,
    verifiedCapex: capex !== undefined,
    source: {
      provider: "Yahoo Finance",
      verified: true,
      asOf: new Date().toISOString(),
      marketTime: toDate(price.regularMarketTime)?.toISOString(),
      warnings,
    },
  };
}
