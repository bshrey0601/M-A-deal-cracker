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
