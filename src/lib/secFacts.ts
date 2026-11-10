import { Citation, Citations, CompanyData, FactCitation } from "../types";
import { Quote } from "./quote";
import {
  balanceSheetCheck, citationSumCheck, datesAlignedCheck, epsCheck, filingFreshnessCheck,
  priceCheck, restatementCheck, sanityCheck, sharesCheck,
} from "./accuracyChecks";

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
  /** Accession number of the filing that reported this value. */
  accn?: string;
  /** Set by series(): the XBRL concept and unit the row came from. */
  concept?: string;
  unit?: string;
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
  /** Recent filings as parallel arrays (data.sec.gov/submissions format). */
  filings?: { recent?: { accessionNumber?: string[]; primaryDocument?: string[] } };
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
    if (usable?.length) return usable.map(r => ({ ...r, concept: `${taxonomy}:${tag}`, unit }));
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
  /** The filed facts that make up `value` (+1 added, -1 subtracted). */
  parts: Part[];
  /** The two facts compared for `yoy`: [current, prior]. */
  yoyParts?: [SecFact, SecFact];
}

export interface Part {
  fact: SecFact;
  sign: 1 | -1;
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
      parts: [
        { fact: annual, sign: 1 },
        { fact: ytd, sign: 1 },
        { fact: prior, sign: -1 },
      ],
      yoyParts: [ytd, prior],
    };
  }
  return {
    value: annual.val,
    end: annual.end,
    isLTM: false,
    fy: annual.fy,
    yoy: priorAnnual?.val ? annual.val / priorAnnual.val - 1 : undefined,
    parts: [{ fact: annual, sign: 1 }],
    yoyParts: priorAnnual ? [annual, priorAnnual] : undefined,
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
  // Used only by the accuracy checks.
  assets: ["Assets"],
  liabilitiesAndEquity: ["LiabilitiesAndStockholdersEquity"],
  liabilities: ["Liabilities"],
  equityInclNci: ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  minorityInterest: ["MinorityInterest"],
  temporaryEquity: ["TemporaryEquityCarryingAmountAttributableToParent", "TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests"],
  redeemableNci: ["RedeemableNoncontrollingInterestEquityCarryingAmount"],
  epsDiluted: ["EarningsPerShareDiluted"],
  weightedDilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
};

/** Shares outstanding from the latest cover page (summing share classes reported on the same filing). */
function sharesOutstanding(facts: SecCompanyFacts): { shares?: number; end?: string; used: SecFact[]; method: string } {
  const cover = series(facts, ["EntityCommonStockSharesOutstanding"], "shares", "dei");
  const top = latest(cover);
  if (top) {
    const sameFiling = cover.filter(r => r.end === top.end && r.filed === top.filed);
    return {
      shares: sameFiling.reduce((s, r) => s + r.val, 0),
      end: top.end,
      used: sameFiling,
      method: `Shares outstanding on the cover page of the latest filing, as of ${top.end}${sameFiling.length > 1 ? " (all share classes added)" : ""}.`,
    };
  }
  const bs = latest(series(facts, ["CommonStockSharesOutstanding"], "shares"));
  if (bs) return { shares: bs.val, end: bs.end, used: [bs], method: `Shares outstanding on the balance sheet as of ${bs.end}.` };
  const wa = latest(series(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], "shares"));
  return {
    shares: wa?.val,
    end: wa?.end,
    used: wa ? [wa] : [],
    method: `Weighted-average diluted shares for the period ended ${wa?.end} (no shares-outstanding figure was filed).`,
  };
}

/** Link to the filing on sec.gov: the main document when known, else the filing index. */
export function filingUrl(cik: number | undefined, accn: string | undefined, docs: Map<string, string>): string | undefined {
  if (!cik || !accn) return undefined;
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g, "")}`;
  const doc = docs.get(accn);
  return doc ? `${base}/${doc}` : `${base}/${accn}-index.htm`;
}

function primaryDocs(submissions: SecSubmissions | undefined): Map<string, string> {
  const recent = submissions?.filings?.recent;
  const map = new Map<string, string>();
  recent?.accessionNumber?.forEach((a, i) => {
    const doc = recent.primaryDocument?.[i];
    if (doc) map.set(a, doc);
  });
  return map;
}

const describePeriod = (f: SecFact) => (f.start ? `${f.start} to ${f.end}` : `as of ${f.end}`);

function flowMethod(v: FlowValue): string {
  if (!v.isLTM) return `Fiscal year ended ${v.end}, as filed.`;
  const [annual, ytd, prior] = v.parts.map(p => p.fact);
  return (
    `Last twelve months to ${v.end} = fiscal year (${describePeriod(annual)}) ` +
    `+ current year-to-date (${describePeriod(ytd)}) − prior-year year-to-date (${describePeriod(prior)}).`
  );
}

export function mapSecToCompany(
  ticker: string,
  facts: SecCompanyFacts,
  submissions: SecSubmissions | undefined,
  quote: Quote,
  now: Date = new Date(),
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
  const atF = (tags: string[], date = bsDate) =>
    date ? series(facts, tags).filter(r => r.end === date).sort(newest)[0] : undefined;

  // Every filed number that goes into net debt, with its sign.
  const debtParts: Part[] = [];
  let debtDate = bsDate;
  const ltdTotal = atF(TAGS.longTermDebtTotal);
  const ltdNon = atF(TAGS.longTermDebtNoncurrent);
  const addDebt = (f: SecFact | undefined) => f && debtParts.push({ fact: f, sign: 1 });
  if (ltdTotal) addDebt(ltdTotal);
  else if (ltdNon) {
    addDebt(ltdNon);
    addDebt(atF(TAGS.longTermDebtCurrent));
  } else {
    // Some filers tag total debt only in the annual report: use the latest date that has it.
    const older = latest(series(facts, TAGS.longTermDebtTotal)) ?? latest(series(facts, TAGS.longTermDebtNoncurrent));
    debtDate = older?.end;
    if (older) {
      const total = atF(TAGS.longTermDebtTotal, older.end);
      if (total) addDebt(total);
      else {
        addDebt(atF(TAGS.longTermDebtNoncurrent, older.end));
        addDebt(atF(TAGS.longTermDebtCurrent, older.end));
      }
      warnings.push(`Long-term debt taken from ${older.end}, the latest filing that reports it.`);
    } else warnings.push("No long-term debt reported in filings; treated as 0.");
  }
  addDebt(atF(TAGS.shortTermDebt, debtDate));
  const cashParts: Part[] = [cash, atF(TAGS.shortTermInvestments)]
    .filter((f): f is SecFact => !!f)
    .map(fact => ({ fact, sign: -1 }));
  const debt = debtParts.reduce((s, p) => s + p.fact.val, 0);
  const cashTotal = cashParts.reduce((s, p) => s + p.fact.val, 0);
  const equityFact = atF(TAGS.equity) ?? equityLatest;
  const equity = equityFact?.val;

  const sharesInfo = sharesOutstanding(facts);
  const { shares } = sharesInfo;
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

  // ---- citations: the filing behind every figure ----
  const docs = primaryDocs(submissions);
  const toCite = (p: Part): FactCitation => ({
    concept: p.fact.concept ?? "",
    value: p.fact.val,
    unit: p.fact.unit ?? "USD",
    start: p.fact.start,
    end: p.fact.end,
    form: p.fact.form,
    filed: p.fact.filed,
    accn: p.fact.accn,
    url: filingUrl(facts.cik, p.fact.accn, docs),
    sign: p.sign,
  });
  const fromFlow = (v: FlowValue | undefined, extra = ""): Citation | undefined =>
    v && { kind: "sec", method: flowMethod(v) + extra, facts: v.parts.map(toCite) };
  const derived = (method: string, inputs: Citation["inputs"]): Citation => ({ kind: "derived", method, facts: [], inputs });
  const priceKind = quote.provider === "entered by user" ? "user" : "market";

  const citations: Citations = {
    currentPrice: {
      kind: priceKind,
      method: priceKind === "user"
        ? "Share price typed in by the user because no live price source answered. Not from a filing."
        : `Last traded price from ${quote.provider}${quote.time ? ` at ${quote.time.toISOString()}` : ""}. Market data, not from a filing; may be delayed.`,
      facts: [],
    },
    sharesOutstanding: { kind: "sec", method: sharesInfo.method, facts: sharesInfo.used.map(fact => toCite({ fact, sign: 1 })) },
    marketCap: derived("Share price × shares outstanding.", ["currentPrice", "sharesOutstanding"]),
    revenue: fromFlow(revenue),
    ebit: fromFlow(ebitV),
    netIncome: fromFlow(niV),
    da: fromFlow(daV),
    capex: fromFlow(capexV, " Filed as a cash outflow (payments for property, plant and equipment); shown as a positive number."),
    dividendPerShare: fromFlow(dpsV),
    ebitda: derived("Operating income (EBIT) + depreciation & amortization.", ["ebit", "da"]),
    netDebt: {
      kind: "sec",
      method:
        `Borrowings (as of ${debtDate ?? "n/a"}) − cash and short-term investments (as of ${bsDate ?? "n/a"}). ` +
        "Operating and finance leases are excluded.",
      facts: [...debtParts, ...cashParts].map(toCite),
    },
    bookValuePerShare: equityFact
      ? {
          kind: "sec",
          method: `Total stockholders' equity (as of ${equityFact.end}) ÷ shares outstanding.`,
          facts: [toCite({ fact: equityFact, sign: 1 })],
          inputs: ["sharesOutstanding"],
        }
      : undefined,
    eps: derived("Net income ÷ shares outstanding (uses current shares, not the filed EPS figure).", ["netIncome", "sharesOutstanding"]),
    peRatio: derived("Share price ÷ EPS.", ["currentPrice", "eps"]),
    evEbitda: derived("Enterprise value (market cap + net debt) ÷ EBITDA.", ["marketCap", "netDebt", "ebitda"]),
    evRevenue: derived("Enterprise value (market cap + net debt) ÷ revenue.", ["marketCap", "netDebt", "revenue"]),
    pbRatio: derived("Share price ÷ book value per share.", ["currentPrice", "bookValuePerShare"]),
    ebitdaMargin: derived("EBITDA ÷ revenue.", ["ebitda", "revenue"]),
    netMargin: derived("Net income ÷ revenue.", ["netIncome", "revenue"]),
    revenueGrowthYoY: revenue.yoyParts
      ? {
          kind: "sec",
          method: `Revenue for ${describePeriod(revenue.yoyParts[0])} compared with the same period a year earlier (${describePeriod(revenue.yoyParts[1])}).`,
          facts: [toCite({ fact: revenue.yoyParts[0], sign: 1 }), toCite({ fact: revenue.yoyParts[1], sign: 1 })],
        }
      : undefined,
  };
  for (const k of Object.keys(citations) as (keyof Citations)[]) if (!citations[k]) delete citations[k];

  // ---- automatic accuracy checks ----
  const val = (tags: string[]) => atF(tags)?.val;
  const equityInclNci = val(TAGS.equityInclNci) ?? (equity !== undefined ? equity + (val(TAGS.minorityInterest) ?? 0) : undefined);
  const tempEquity = (val(TAGS.temporaryEquity) ?? 0) + (val(TAGS.redeemableNci) ?? 0);
  const epsFiled = ltm(series(facts, TAGS.epsDiluted, "USD/shares"));
  const epsComparable = epsFiled && epsFiled.end === revenue.end ? epsFiled.value : undefined;
  const wDil = series(facts, TAGS.weightedDilutedShares, "shares").filter(r => r.start && r.end === revenue.end).sort(newest)[0];
  const usedParts = [revenue, ebitV, niV, daV, capexV].flatMap(v => v?.parts ?? []).concat(debtParts, cashParts);
  const latestFiled = usedParts.map(p => p.fact.filed ?? "").sort().pop() || undefined;
  const flowItems = [
    { label: "Revenue", v: revenue, tags: TAGS.revenue },
    { label: "Operating income", v: ebitV, tags: TAGS.ebit },
    { label: "Net income", v: niV, tags: TAGS.netIncome },
  ];
  const figures = {
    revenue: rev, ebit: ebit ?? 0, ebitda, netIncome, da: da ?? 0, capex: capex ?? 0, sharesOutstanding: sharesMn, netDebt,
  };
  const checks = [
    citationSumCheck(figures, citations),
    balanceSheetCheck({
      date: bsDate,
      assets: val(TAGS.assets),
      liabilitiesAndEquity: val(TAGS.liabilitiesAndEquity),
      liabilities: val(TAGS.liabilities),
      equityInclNci,
      temporaryEquity: tempEquity || undefined,
    }),
    restatementCheck(
      flowItems
        .filter(i => i.v)
        .map(i => ({ label: i.label, used: i.v!.parts.map(p => p.fact), all: series(facts, i.tags) })),
    ),
    epsCheck(eps, epsComparable, revenue.isLTM ? `the last twelve months to ${revenue.end}` : `the fiscal year ended ${revenue.end}`),
    sharesCheck(shares, wDil?.val, wDil ? `${wDil.start} to ${wDil.end}` : undefined),
    datesAlignedCheck(debtParts.length ? debtDate : undefined, cash?.end),
    filingFreshnessCheck(latestFiled, revenue.end, now),
    priceCheck(quote.provider, quote.time, now),
    sanityCheck(figures),
  ];

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
    citations,
    checks,
  };
}
