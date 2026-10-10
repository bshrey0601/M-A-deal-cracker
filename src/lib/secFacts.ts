import { CompanyData } from "../types";
import { Quote } from "./quote";

/**
 * Builds CompanyData from SEC EDGAR XBRL "company facts" (numbers as filed in 10-K / 10-Q
 * reports) plus a market quote. Pure so it can be unit tested without network.
 *
 * Flow items (revenue, operating income, net income, D&A, CapEx) are last-twelve-months:
 * latest fiscal year + current year-to-date - prior-year year-to-date.
 * Balance-sheet items (cash, debt, equity, shares) are the latest reported values.
 */

export interface SecFact {
  start?: string;
  end: string;
  val: number;
  form?: string;
  filed?: string;
  fy?: number;
  fp?: string;
}

export interface SecCompanyFacts {
  cik?: number;
  entityName?: string;
  facts?: Record<string, Record<string, { units?: Record<string, SecFact[]> }>>;
}

export interface SecSubmissions {
  name?: string;
  sicDescription?: string;
  exchanges?: string[];
}

const DAY = 86_400_000;
const M = 1e6;
const FORMS = new Set(["10-K", "10-Q", "10-K/A", "10-Q/A", "10-KT", "20-F", "40-F"]);

const t = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const days = (f: SecFact) => (f.start ? (t(f.end) - t(f.start)) / DAY : 0);
const newest = (a: SecFact, b: SecFact) =>
  t(b.end) - t(a.end) || (b.filed ?? "").localeCompare(a.filed ?? "");

/** First tag (in priority order) that has data in the given unit. */
function series(facts: SecCompanyFacts, tags: string[], unit = "USD", taxonomy = "us-gaap"): SecFact[] {
  for (const tag of tags) {
    const rows = facts.facts?.[taxonomy]?.[tag]?.units?.[unit];
    const usable = rows?.filter(r => typeof r.val === "number" && r.end && (!r.form || FORMS.has(r.form)));
    if (usable?.length) return usable;
  }
  return [];
}

export interface FlowValue {
  value: number;
  /** End date of the period covered (YYYY-MM-DD). */
  end: string;
  /** True when a later 10-Q extended the latest annual figure to LTM. */
  isLTM: boolean;
  fy?: number;
  /** Year-over-year growth of the latest comparable period, as a fraction. */
  yoy?: number;
}

/** Last-twelve-months value of a duration fact (see file header). */
export function ltm(rows: SecFact[]): FlowValue | undefined {
  const dur = rows.filter(r => r.start);
  const annuals = dur.filter(r => days(r) >= 350 && days(r) <= 380).sort(newest);
  const annual = annuals[0];
  if (!annual) return undefined;

  const near = (a: number, b: number, tol = 15) => Math.abs(a - b) <= tol * DAY;
  const priorAnnual = annuals.find(r => near(t(r.end), t(annual.end) - 365 * DAY));

  // Latest interim period after the annual; prefer the year-to-date (longest) figure.
  const later = dur.filter(r => t(r.end) > t(annual.end) && days(r) >= 80 && days(r) < 350);
  const latestEnd = later.reduce((m, r) => Math.max(m, t(r.end)), 0);
  const ytd = later
    .filter(r => t(r.end) === latestEnd)
    .sort((a, b) => days(b) - days(a) || (b.filed ?? "").localeCompare(a.filed ?? ""))[0];
  const prior = ytd
    ? dur
        .filter(r => near(days(r) * DAY, days(ytd) * DAY) && near(t(r.end), t(ytd.end) - 365 * DAY))
        .sort(newest)[0]
    : undefined;

  if (ytd && prior) {
    return {
      value: annual.val + ytd.val - prior.val,
      end: ytd.end,
      isLTM: true,
      fy: annual.fy,
      yoy: prior.val ? ytd.val / prior.val - 1 : undefined,
    };
  }
  return {
    value: annual.val,
    end: annual.end,
    isLTM: false,
    fy: annual.fy,
    yoy: priorAnnual?.val ? annual.val / priorAnnual.val - 1 : undefined,
  };
}

/** Latest point-in-time (balance sheet) value. */
export function latest(rows: SecFact[]): SecFact | undefined {
  return [...rows].sort(newest)[0];
}

const TAGS = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueGoodsNet",
  ],
  ebit: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"],
  da: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "Depreciation",
  ],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  cash: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "Cash",
  ],
  shortTermInvestments: ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
  longTermDebtTotal: ["LongTermDebt", "LongTermDebtAndCapitalLeaseObligations"],
  longTermDebtNoncurrent: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligationsNoncurrent"],
  longTermDebtCurrent: ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"],
  shortTermDebt: ["ShortTermBorrowings", "CommercialPaper"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  dividendsPerShare: ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"],
};

/** Shares outstanding from the latest cover page (summing share classes reported on the same filing). */
function sharesOutstanding(facts: SecCompanyFacts): { shares?: number; end?: string } {
  const cover = series(facts, ["EntityCommonStockSharesOutstanding"], "shares", "dei");
  const top = latest(cover);
  if (top) {
    const sameFiling = cover.filter(r => r.end === top.end && r.filed === top.filed);
    return { shares: sameFiling.reduce((s, r) => s + r.val, 0), end: top.end };
  }
  const bs = latest(series(facts, ["CommonStockSharesOutstanding"], "shares"));
  if (bs) return { shares: bs.val, end: bs.end };
  const wa = latest(series(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], "shares"));
  return { shares: wa?.val, end: wa?.end };
}

export function mapSecToCompany(
  ticker: string,
  facts: SecCompanyFacts,
  submissions: SecSubmissions | undefined,
  quote: Quote,
): CompanyData {
  const revenue = ltm(series(facts, TAGS.revenue));
  if (!revenue) throw new Error(`SEC filings for ${ticker} have no annual revenue in US GAAP.`);
  if (quote.currency !== "USD") throw new Error(`${ticker} trades in ${quote.currency}; SEC figures are in USD.`);

  const warnings: string[] = [];
  const ebitV = ltm(series(facts, TAGS.ebit));
  const niV = ltm(series(facts, TAGS.netIncome));
  const daV = ltm(series(facts, TAGS.da));
  const capexV = ltm(series(facts, TAGS.capex));
  const dpsV = ltm(series(facts, TAGS.dividendsPerShare, "USD/shares"));

  // Balance sheet as of the latest date cash is reported; every component is read at that date.
  const cash = latest(series(facts, TAGS.cash));
  const equityLatest = latest(series(facts, TAGS.equity));
  const bsDate = cash?.end ?? equityLatest?.end;
  const at = (tags: string[], date = bsDate) =>
    date ? series(facts, tags).filter(r => r.end === date).sort(newest)[0]?.val : undefined;

  let debt: number;
  let debtDate = bsDate;
  const ltdTotal = at(TAGS.longTermDebtTotal);
  const ltdNon = at(TAGS.longTermDebtNoncurrent);
  if (ltdTotal !== undefined) debt = ltdTotal;
  else if (ltdNon !== undefined) debt = ltdNon + (at(TAGS.longTermDebtCurrent) ?? 0);
  else {
    // Some filers tag total debt only in the annual report: use the latest date that has it.
    const older = latest(series(facts, TAGS.longTermDebtTotal)) ?? latest(series(facts, TAGS.longTermDebtNoncurrent));
    debtDate = older?.end;
    debt = older
      ? (at(TAGS.longTermDebtTotal, older.end) ??
         (at(TAGS.longTermDebtNoncurrent, older.end) ?? 0) + (at(TAGS.longTermDebtCurrent, older.end) ?? 0))
      : 0;
    if (!older) warnings.push("No long-term debt reported in filings; treated as 0.");
    else warnings.push(`Long-term debt taken from ${older.end}, the latest filing that reports it.`);
  }
  debt += at(TAGS.shortTermDebt, debtDate) ?? 0;
  const cashTotal = (cash?.val ?? 0) + (at(TAGS.shortTermInvestments) ?? 0);
  const equity = at(TAGS.equity) ?? equityLatest?.val;

  const { shares } = sharesOutstanding(facts);
  if (!shares) throw new Error(`SEC filings for ${ticker} do not report shares outstanding.`);

  const sharesMn = shares / M;
  const rev = revenue.value / M;
  const ebit = ebitV ? ebitV.value / M : undefined;
  const da = daV ? daV.value / M : undefined;
  const capex = capexV ? Math.abs(capexV.value) / M : undefined;
  const netIncome = niV ? niV.value / M : 0;
  const ebitda = ebit !== undefined ? ebit + (da ?? 0) : 0;
  const netDebt = (debt - cashTotal) / M;
  const marketCap = quote.price * sharesMn;
  const ev = marketCap + netDebt;
  const eps = sharesMn ? netIncome / sharesMn : 0;
  const bvps = equity && sharesMn ? equity / M / sharesMn : 0;

  const period = revenue.isLTM ? `last twelve months to ${revenue.end}` : `fiscal year ended ${revenue.end}`;
  warnings.push(`Financials from SEC 10-K/10-Q filings, ${period}. EBITDA = operating income + D&A.`);
  warnings.push(`Net debt = borrowings minus cash and short-term investments as of ${bsDate ?? "latest filing"} (excludes leases).`);
  if (ebit === undefined) warnings.push("Operating income not reported in US GAAP tags; EBIT and EBITDA set to 0.");
  if (da === undefined) warnings.push("D&A not reported; DCF uses the default 5% of revenue.");
  if (capex === undefined) warnings.push("CapEx not reported; DCF uses the default 5% of revenue.");
  if (!niV) warnings.push("Net income not reported; set to 0.");

  const name = submissions?.name ?? facts.entityName ?? quote.name ?? ticker;
  const sector = submissions?.sicDescription ?? "Unclassified";

  return {
    name,
    ticker,
    sector,
    currency: "$",
    unit: "Mn",
    currentPrice: quote.price,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? quote.price,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? quote.price,
    sharesOutstanding: sharesMn,
    marketCap,
    revenue: rev,
    ebitda,
    ebit: ebit ?? 0,
    netIncome,
    eps,
    da: da ?? 0,
    capex: capex ?? 0,
    netDebt,
    bookValuePerShare: bvps,
    dividendPerShare: dpsV?.value ?? 0,
    peRatio: eps > 0 ? quote.price / eps : NaN,
    evEbitda: ebitda > 0 ? ev / ebitda : NaN,
    evRevenue: rev ? ev / rev : NaN,
    pbRatio: bvps > 0 ? quote.price / bvps : NaN,
    revenueGrowthYoY: (revenue.yoy ?? 0) * 100,
    ebitdaMargin: rev ? (ebitda / rev) * 100 : 0,
    netMargin: rev ? (netIncome / rev) * 100 : 0,
    fiscalYear: revenue.isLTM ? `LTM ${revenue.end}` : `FY${revenue.fy ?? revenue.end.slice(0, 4)}`,
    exchange: submissions?.exchanges?.[0] ?? quote.exchange ?? "",
    description: `${name} · ${sector}`,
    verifiedDA: da !== undefined,
    verifiedCapex: capex !== undefined,
    source: {
      provider: `SEC EDGAR filings · price: ${quote.provider}`,
      verified: true,
      asOf: new Date().toISOString(),
      marketTime: quote.time?.toISOString(),
      warnings,
    },
  };
}
