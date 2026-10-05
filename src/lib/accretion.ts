import { CompanyData, DealState } from "../types";

// All monetary values are in millions of the reporting currency; share counts in millions.

export interface AccretionInputs {
  target: CompanyData;
  acquirer: CompanyData;
  deal: DealState["deal"];
  syn: DealState["syn"];
  ppa: DealState["ppa"];
  taxRate: number; // %
}

export interface AccretionResult {
  equityPurchasePrice: number;
  enterpriseValue: number;
  premiumPct: number;
  cashConsideration: number;
  stockConsideration: number;
  fees: number;
  newDebt: number;
  newSharesIssued: number;
  afterTaxInterest: number;
  // Synergies (annual run-rate, pre-tax)
  revenueSynergies: number;
  costSynergies: number;
  totalSynergies: number;
  integrationCosts: number;
  // PPA
  targetBookValue: number;
  excessPurchasePrice: number;
  identifiedIntangibles: number;
  goodwill: number;
  annualAmortization: number;
  // Pro-forma
  standaloneNetIncome: number;
  standaloneShares: number;
  standaloneEPS: number;
  proFormaNetIncome: number;
  proFormaShares: number;
  proFormaEPS: number;
  accretionPct: number;
  accretive: boolean;
  targetOwnershipPct: number;
  breakevenSynergies: number;
  meaningful: boolean; // false when standalone EPS <= 0 (accretion % has no sensible sign)
}

export function computeAccretion({ target, acquirer, deal, syn, ppa, taxRate }: AccretionInputs): AccretionResult {
  const tax = taxRate / 100;

  const equityPurchasePrice = deal.offer * target.sharesOutstanding;
  const enterpriseValue = equityPurchasePrice + target.netDebt;
  const premiumPct = target.currentPrice > 0 ? (deal.offer / target.currentPrice - 1) * 100 : NaN;

  // Consideration mix. Cash portion and transaction fees are assumed fully debt-financed.
  const cashShare = deal.cashPct / (deal.cashPct + deal.stockPct || 1);
  const cashConsideration = equityPurchasePrice * cashShare;
  const stockConsideration = equityPurchasePrice - cashConsideration;
  const fees = equityPurchasePrice * (deal.fees / 100);
  const newDebt = cashConsideration + fees;
  const preTaxInterest = newDebt * (deal.finRate / 100);
  const afterTaxInterest = preTaxInterest * (1 - tax);
  const newSharesIssued = acquirer.currentPrice > 0 ? stockConsideration / acquirer.currentPrice : 0;

  // Synergies: run-rate pre-tax EBIT impact, scaled by realization %.
  const revenueSynergies = (syn.cSell + syn.geo + syn.prc + syn.bnd) * (syn.rR / 100);
  const costSynergies = (syn.hc + syn.proc + syn.fac + syn.it) * (syn.cR / 100);
  const totalSynergies = revenueSynergies + costSynergies;
  const integrationCosts = syn.sev + syn.itI + syn.leg;

  // Purchase price allocation: excess over book value split between amortizable intangibles and goodwill.
  const targetBookValue = target.bookValuePerShare * target.sharesOutstanding;
  const excessPurchasePrice = Math.max(0, equityPurchasePrice - targetBookValue);
  const identifiedIntangibles = excessPurchasePrice * (ppa.intangPct / 100);
  const goodwill = excessPurchasePrice - identifiedIntangibles;
  const annualAmortization = ppa.life > 0 ? identifiedIntangibles / ppa.life : 0;

  const standaloneNetIncome = acquirer.netIncome;
  const standaloneShares = acquirer.sharesOutstanding;
  const standaloneEPS = standaloneShares > 0 ? standaloneNetIncome / standaloneShares : NaN;

  const preTaxAdjustments = totalSynergies - preTaxInterest - annualAmortization;
  const proFormaNetIncome = acquirer.netIncome + target.netIncome + preTaxAdjustments * (1 - tax);
  const proFormaShares = standaloneShares + newSharesIssued;
  const proFormaEPS = proFormaShares > 0 ? proFormaNetIncome / proFormaShares : NaN;

  const meaningful = standaloneEPS > 0;
  const accretionPct = meaningful ? (proFormaEPS / standaloneEPS - 1) * 100 : NaN;

  // Pre-tax synergies at which pro-forma EPS equals standalone EPS.
  const requiredNI = standaloneEPS * proFormaShares;
  const breakevenSynergies = meaningful && tax < 1
    ? Math.max(0, (requiredNI - acquirer.netIncome - target.netIncome) / (1 - tax) + preTaxInterest + annualAmortization)
    : NaN;

  return {
    equityPurchasePrice,
    enterpriseValue,
    premiumPct,
    cashConsideration,
    stockConsideration,
    fees,
    newDebt,
    newSharesIssued,
    afterTaxInterest,
    revenueSynergies,
    costSynergies,
    totalSynergies,
    integrationCosts,
    targetBookValue,
    excessPurchasePrice,
    identifiedIntangibles,
    goodwill,
    annualAmortization,
    standaloneNetIncome,
    standaloneShares,
    standaloneEPS,
    proFormaNetIncome,
    proFormaShares,
    proFormaEPS,
    accretionPct,
    accretive: meaningful && proFormaEPS >= standaloneEPS,
    targetOwnershipPct: proFormaShares > 0 ? (newSharesIssued / proFormaShares) * 100 : 0,
    breakevenSynergies,
    meaningful,
  };
}
