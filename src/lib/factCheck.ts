import { CompanyData, DealState } from "../types";
import { AccretionResult } from "./accretion";
import { computeDCF } from "./dcf";
import { simulateAccretion, simulateDcf } from "./monteCarlo";

/**
 * Fact-checking for the AI-written memo. The model gets a fact sheet of every figure it may use;
 * afterwards every number in the memo is matched back to that sheet. Numbers that match nothing
 * are flagged, so an invented or miscalculated figure can't pass silently. Pure, no DOM.
 */

/** money = millions of the reporting currency; perShare = currency per share. */
export type FactKind = "money" | "perShare" | "pct" | "multiple" | "count";

export interface Fact {
  label: string;
  value: number;
  kind: FactKind;
  /** Where the figure comes from, e.g. "SEC filing" or "model". */
  source: string;
}

const ok = (v: number) => Number.isFinite(v);

export function buildFacts(state: DealState, acc: AccretionResult): Fact[] {
  const t = state.target!;
  const a = state.acquirer!;
  const facts: Fact[] = [];
  const add = (label: string, value: number, kind: FactKind, source: string) => {
    if (ok(value)) facts.push({ label, value, kind, source });
  };
  const filed = (c: CompanyData) => (c.citations ? "SEC filing" : c.source?.verified ? c.source.provider : "AI estimate (unverified)");

  for (const [who, c] of [["Target", t], ["Acquirer", a]] as const) {
    add(`${who} share price`, c.currentPrice, "perShare", "market price");
    add(`${who} market cap`, c.marketCap, "money", "price × filed shares");
    add(`${who} shares outstanding (Mn)`, c.sharesOutstanding, "count", filed(c));
    add(`${who} revenue`, c.revenue, "money", filed(c));
    add(`${who} revenue growth`, c.revenueGrowthYoY, "pct", filed(c));
    add(`${who} EBITDA`, c.ebitda, "money", filed(c));
    add(`${who} EBITDA margin`, c.ebitdaMargin, "pct", "calculated");
    add(`${who} operating income (EBIT)`, c.ebit, "money", filed(c));
    add(`${who} net income`, c.netIncome, "money", filed(c));
    add(`${who} net margin`, c.netMargin, "pct", "calculated");
    add(`${who} EPS`, c.eps, "perShare", "calculated");
    add(`${who} net debt`, c.netDebt, "money", filed(c));
    add(`${who} EV/EBITDA (trading)`, c.evEbitda, "multiple", "calculated");
    add(`${who} P/E`, c.peRatio, "multiple", "calculated");
  }

  const ev = acc.enterpriseValue;
  add("Offer price per share", state.deal.offer, "perShare", "deal terms");
  add("Offer premium", acc.premiumPct, "pct", "deal terms");
  add("Cash consideration share", state.deal.cashPct, "pct", "deal terms");
  add("Stock consideration share", state.deal.stockPct, "pct", "deal terms");
  add("Transaction fees", state.deal.fees, "pct", "deal terms");
  add("Financing rate", state.deal.finRate, "pct", "deal terms");
  add("Equity purchase price", acc.equityPurchasePrice, "money", "model");
  add("Implied enterprise value", ev, "money", "model");
  add("EV/EBITDA paid", t.ebitda > 0 ? ev / t.ebitda : NaN, "multiple", "model");
  add("EV/Revenue paid", t.revenue > 0 ? ev / t.revenue : NaN, "multiple", "model");
  add("Cash consideration", acc.cashConsideration, "money", "model");
  add("Stock consideration", acc.stockConsideration, "money", "model");
  add("Fees", acc.fees, "money", "model");
  add("New debt raised", acc.newDebt, "money", "model");
  add("New acquirer shares issued (Mn)", acc.newSharesIssued, "count", "model");
  add("Target holders' pro-forma ownership", acc.targetOwnershipPct, "pct", "model");
  add("Revenue synergies (realised, run-rate)", acc.revenueSynergies, "money", "model");
  add("Cost synergies (realised, run-rate)", acc.costSynergies, "money", "model");
  add("Total synergies (run-rate)", acc.totalSynergies, "money", "model");
  add("One-time integration costs", acc.integrationCosts, "money", "model");
  add("Goodwill", acc.goodwill, "money", "model");
  add("Identified intangibles", acc.identifiedIntangibles, "money", "model");
  add("Annual amortisation", acc.annualAmortization, "money", "model");
  add("Intangibles share of excess price", state.ppa.intangPct, "pct", "assumption");
  add("Intangibles amortisation life (years)", state.ppa.life, "count", "assumption");
  add("Standalone acquirer EPS", acc.standaloneEPS, "perShare", "model");
  add("Pro-forma EPS", acc.proFormaEPS, "perShare", "model");
  if (acc.meaningful) add("EPS accretion / dilution", acc.accretionPct, "pct", "model");
  add("Breakeven pre-tax synergies", acc.breakevenSynergies, "money", "model");
  add("WACC", state.wacc, "pct", "model");
  add("DCF WACC", state.dcf.wacc, "pct", "assumption");
  add("Terminal growth rate", state.dcf.tgr, "pct", "assumption");
  add("Tax rate", state.dcf.tax, "pct", "assumption");
  add("EBIT margin (DCF)", state.dcf.ebitM, "pct", "assumption");
  for (const [name, g] of [["Bear", state.dcf.bear], ["Base", state.dcf.base], ["Bull", state.dcf.bull]] as const) {
    add(`${name} case revenue growth`, g, "pct", "assumption");
    const r = computeDCF(g, state.dcf, t);
    if (r) {
      add(`${name} case DCF value per share`, r.price, "perShare", "model");
      add(`${name} case DCF enterprise value`, r.EV, "money", "model");
    }
  }
  if (state.mc) {
    const sim = simulateDcf(state, t);
    if (sim) {
      add("Monte Carlo DCF median value per share", sim.price.p50, "perShare", "model");
      add("Monte Carlo DCF 10th percentile value per share", sim.price.p10, "perShare", "model");
      add("Monte Carlo DCF 90th percentile value per share", sim.price.p90, "perShare", "model");
      add("Probability the offer exceeds the DCF value (Monte Carlo)", sim.probOfferAbove * 100, "pct", "model");
    }
    const accSim = simulateAccretion(state, t, a);
    if (accSim) {
      add("Monte Carlo median EPS accretion / dilution", accSim.accretion.p50, "pct", "model");
      add("Probability the deal is EPS accretive (Monte Carlo)", accSim.probAccretive * 100, "pct", "model");
    }
  }
  return facts;
}

/** The fact sheet as plain lines for the prompt. */
export function factSheet(facts: Fact[], currency: string): string {
  const show = (f: Fact) => {
    const n = (d: number) => f.value.toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d });
    switch (f.kind) {
      case "money": return `${currency}${n(1)}M`;
      case "perShare": return `${currency}${n(2)}`;
      case "pct": return `${n(2)}%`;
      case "multiple": return `${n(1)}x`;
      default: return n(1);
    }
  };
  return facts.map(f => `- ${f.label}: ${show(f)}`).join("\n");
}

export interface NumberToken {
  /** Position of the matched text within the input. */
  index: number;
  text: string;
  value: number;
  decimals: number;
  unit: "pct" | "multiple" | "money" | "plain";
  /** Multiplier to millions when a scale word (billion, M, K) was given; undefined if none. */
  scale?: number;
  currency: boolean;
}

// Signs are ignored: "-2.3%" and "2.3% dilutive" both match a -2.3% fact (memos phrase direction in words).
const NUM = /([$₹£€]\s?)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s?(%|x\b|×|bn\b|billion\b|b\b|mn\b|million\b|m\b|k\b|thousand\b))?/gi;

/** Every number in a piece of text, with its unit. */
export function findNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(NUM)) {
    const idx = m.index!;
    // Skip digits that are part of a word or identifier (e.g. "Q1", "FY2025", "10-K").
    const before = text[idx - 1] ?? " ";
    if (/[A-Za-z0-9_.]/.test(before) && !m[1]) continue;
    const end = idx + m[0].length;
    const after = text[end] ?? "";
    if (/[A-Za-z]/.test(after) && !m[4]) continue;
    if (after === "-" && /[KQ]/i.test(text[end + 1] ?? "")) continue; // "10-K", "10-Q"
    const intPart = m[2].replace(/,/g, "");
    const decimals = m[3]?.length ?? 0;
    const value = Number(`${intPart}${m[3] ? `.${m[3]}` : ""}`);
    const u = m[4]?.toLowerCase();
    let unit: NumberToken["unit"] = m[1] ? "money" : "plain";
    let scale: number | undefined;
    if (u === "%") unit = "pct";
    else if (u === "x" || u === "×") unit = "multiple";
    else if (u === "bn" || u === "billion" || u === "b") { unit = "money"; scale = 1000; }
    else if (u === "mn" || u === "million" || u === "m") { unit = "money"; scale = 1; }
    else if (u === "k" || u === "thousand") { unit = "money"; scale = 0.001; }
    out.push({ index: idx, text: m[0].trim(), value, decimals, unit, scale, currency: !!m[1] });
  }
  return out;
}

export interface CheckedNumber extends NumberToken {
  status: "verified" | "unverified" | "ignored";
  fact?: Fact;
}

/** True when `memo` (as written, at its precision) is the fact rounded, allowing 0.5% slack. */
function close(memo: number, decimals: number, fact: number, scale = 1): boolean {
  const halfUnit = 0.5 * Math.pow(10, -decimals) * scale;
  const tol = Math.max(halfUnit, Math.abs(fact) * 0.005) + 1e-9;
  return Math.abs(Math.abs(memo * scale) - Math.abs(fact)) <= tol;
}

/** Matches one number to the fact sheet. */
export function checkNumber(tok: NumberToken, facts: Fact[]): CheckedNumber {
  const isYear = tok.unit === "plain" && tok.decimals === 0 && tok.value >= 1900 && tok.value <= 2100;
  // Small plain integers are counts and labels ("5-year", "top 3 risks", "Phase 1"), not financial figures.
  const smallLabel = tok.unit === "plain" && tok.decimals === 0 && Math.abs(tok.value) < 100;
  const kinds: Record<NumberToken["unit"], FactKind[]> = {
    pct: ["pct"],
    multiple: ["multiple"],
    money: tok.scale !== undefined ? ["money", "count"] : ["money", "perShare"],
    plain: ["money", "perShare", "count", "pct", "multiple"],
  };
  const candidates = facts.filter(f => kinds[tok.unit].includes(f.kind));
  const scale = tok.scale ?? 1;
  const fact = candidates.find(f => close(tok.value, tok.decimals, f.value, scale));
  if (fact) return { ...tok, status: "verified", fact };
  if (isYear || smallLabel) return { ...tok, status: "ignored" };
  return { ...tok, status: "unverified" };
}

export function factCheckText(text: string, facts: Fact[]): CheckedNumber[] {
  return findNumbers(text).map(t => checkNumber(t, facts));
}

export function summarizeCheck(checked: CheckedNumber[]) {
  const verified = checked.filter(c => c.status === "verified").length;
  const unverified = checked.filter(c => c.status === "unverified");
  return { verified, unverified: unverified.length, unverifiedTexts: unverified.map(u => u.text) };
}
