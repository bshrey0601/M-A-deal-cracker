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
}
