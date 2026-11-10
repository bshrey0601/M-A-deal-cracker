export interface CompanyData {
  name: string;
  ticker: string;
  sector: string;
  currency: string;
  unit: string;
  currentPrice: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  sharesOutstanding: number;
  marketCap: number;
  revenue: number;
  ebitda: number;
  ebit: number;
  netIncome: number;
  eps: number;
  da: number;
  capex: number;
  netDebt: number;
  bookValuePerShare: number;
  dividendPerShare: number;
  peRatio: number;
  evEbitda: number;
  evRevenue: number;
  pbRatio: number;
  revenueGrowthYoY: number;
  ebitdaMargin: number;
  netMargin: number;
  fiscalYear: string;
  exchange: string;
  description: string;
  verifiedDA?: boolean;
  verifiedCapex?: boolean;
  source?: DataSource;
  /** Where each figure came from, so the UI can show the exact filing behind it. */
  citations?: Citations;
  /** Automatic accuracy checks run on the figures (SEC-sourced companies only). */
  checks?: AccuracyCheck[];
  /** Automated due-diligence red flags (SEC-sourced companies only). */
  dueDiligence?: DueDiligence;
}

/** One automated due-diligence finding from SEC data. */
export interface DDFlag {
  id: string;
  title: string;
  /** high = serious red flag; medium = review; low = minor; ok = checked, nothing found; na = data not available. */
  severity: "high" | "medium" | "low" | "ok" | "na";
  detail: string;
  score?: number;
  /** Filings on SEC.gov behind this finding. */
  links?: { label: string; url: string }[];
}

export interface DueDiligence {
  asOf: string;
  /** End date of the latest fiscal year analysed. */
  fiscalYear?: string;
  flags: DDFlag[];
}

export interface AccuracyCheck {
  id: string;
  label: string;
  /** pass = verified; warn = gap above 2% or something to review; fail = likely wrong; skipped = data not available. */
  status: "pass" | "warn" | "fail" | "skipped";
  detail: string;
}

/** One reported number as filed with the SEC (XBRL fact). */
export interface FactCitation {
  /** XBRL concept, e.g. "us-gaap:Revenues". */
  concept: string;
  /** Value exactly as filed, in `unit` (not scaled to millions). */
  value: number;
  unit: string;
  /** Reporting period (start is absent for balance-sheet dates). */
  start?: string;
  end: string;
  form?: string;
  filed?: string;
  /** SEC accession number of the filing. */
  accn?: string;
  /** Link to the filing on sec.gov. */
  url?: string;
  /** +1 when the fact is added, -1 when it is subtracted in the calculation. */
  sign: 1 | -1;
}

export type CitedField =
  | "currentPrice" | "sharesOutstanding" | "marketCap" | "revenue" | "ebitda" | "ebit" | "netIncome" | "eps"
  | "da" | "capex" | "netDebt" | "bookValuePerShare" | "dividendPerShare" | "peRatio" | "evEbitda"
  | "evRevenue" | "pbRatio" | "revenueGrowthYoY" | "ebitdaMargin" | "netMargin";

export interface Citation {
  /** sec = official filing; market = price feed; user = typed in; derived = calculated from other figures. */
  kind: "sec" | "market" | "user" | "derived";
  /** Plain-English description of how the figure was obtained. */
  method: string;
  facts: FactCitation[];
  /** Other figures this one is calculated from. */
  inputs?: CitedField[];
}

export type Citations = Partial<Record<CitedField, Citation>>;

export interface DataSource {
  provider: string;
  /** true = figures come from a market-data feed; false = AI estimate, not verified. */
  verified: boolean;
  /** When the app fetched the data (ISO). */
  asOf: string;
  /** Exchange timestamp of the quoted price (ISO), when known. */
  marketTime?: string;
  warnings: string[];
  /** Set when official SEC filings could not be loaded for a US company and another source was used instead. */
  secUnavailable?: string;
}

export interface PrecedentDeal {
  deal: string;
  yr: number;
  sector: string;
  val: number;
  evEv: number | null;
  evRev: number | null;
  prem: number | null;
  type: string;
}

/** A listed comparable company for trading comps, picked by SIC code and size (or added by the user). */
export interface Peer {
  ticker: string;
  name: string;
  /** SIC industry code from the company's SEC filings. */
  sic?: string;
  currency: string;
  price: number;
  /** Millions. */
  marketCap: number;
  netDebt: number;
  revenue: number;
  ebitda: number;
  netIncome: number;
  evRevenue: number;
  evEbitda: number;
  pe: number;
  /** Period of the financials, e.g. "LTM 2026-09-27". */
  period: string;
  /** Data provider, e.g. "SEC EDGAR + Nasdaq". */
  source: string;
  /** Latest filing behind the revenue figure, when known. */
  filingUrl?: string;
  /** Why it was picked, e.g. "Same SIC 3571; revenue closest to the target's". */
  why: string;
  /** Counted in the comps statistics. */
  included: boolean;
}

/** How the auto-picked peers were found (GET /api/peers/:ticker). */
export interface PeerSearchInfo {
  ticker: string;
  sic: string;
  sicDescription?: string;
  /** Listed companies with revenue that matched the SIC search, before picking the closest. */
  candidates: number;
  /** True when the exact SIC code had too few companies and related codes in its industry group were added. */
  widened: boolean;
  /** Calendar year of the revenue used to rank by size. */
  revenueYear: number;
  /** Companies that were picked but whose data could not be loaded. */
  skipped: string[];
  sources: { label: string; url: string }[];
}

export interface DealState {
  target: CompanyData | null;
  acquirer: CompanyData | null;
  wacc: number;
  waccCalibrated: boolean;
  cfVerified: { t: boolean; a: boolean };
  ppaApplied: boolean;
  ppaAnnualAmort: number;
  ppa: {
    intangPct: number;
    life: number;
  };
  precedentsBenchmarked: boolean;
  proformaCalculated: boolean;
  thesisGenerated: boolean;
  deal: {
    offer: number;
    cashPct: number;
    stockPct: number;
    fees: number;
    finRate: number;
  };
  dcf: {
    bear: number;
    base: number;
    bull: number;
    ebitM: number;
    wacc: number;
    tgr: number;
    daPct: number;
    cxPct: number;
    tax: number;
  };
  syn: {
    cSell: number;
    geo: number;
    prc: number;
    bnd: number;
    rR: number;
    hc: number;
    proc: number;
    fac: number;
    it: number;
    cR: number;
    sev: number;
    itI: number;
    leg: number;
  };
  selectedPrecedents: number[];
  /** Trading comparables for the target (Market Cross-Check). */
  peers: Peer[];
  peerInfo?: PeerSearchInfo;
}
