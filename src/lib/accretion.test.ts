import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAccretion, AccretionInputs } from "./accretion";
import { CompanyData } from "../types";

const company = (o: Partial<CompanyData>): CompanyData => ({
  name: "Co", ticker: "CO", sector: "x", currency: "$", unit: "Mn",
  currentPrice: 0, fiftyTwoWeekHigh: 0, fiftyTwoWeekLow: 0, sharesOutstanding: 0,
  marketCap: 0, revenue: 0, ebitda: 0, ebit: 0, netIncome: 0, eps: 0, da: 0, capex: 0,
  netDebt: 0, bookValuePerShare: 0, dividendPerShare: 0, peRatio: 0, evEbitda: 0,
  evRevenue: 0, pbRatio: 0, revenueGrowthYoY: 0, ebitdaMargin: 0, netMargin: 0,
  fiscalYear: "FY", exchange: "X", description: "", ...o,
});

const noSyn = { cSell: 0, geo: 0, prc: 0, bnd: 0, rR: 100, hc: 0, proc: 0, fac: 0, it: 0, cR: 100, sev: 0, itI: 0, leg: 0 };

// Acquirer: 100 sh @ $50, NI 500 -> EPS 5.00 (P/E 10)
// Target:   20 sh @ $20, NI 40, BVPS 10, net debt 100
const base = (): AccretionInputs => ({
  acquirer: company({ currentPrice: 50, sharesOutstanding: 100, netIncome: 500 }),
  target: company({ currentPrice: 20, sharesOutstanding: 20, netIncome: 40, bookValuePerShare: 10, netDebt: 100 }),
  deal: { offer: 25, cashPct: 50, stockPct: 50, fees: 2, finRate: 8 },
  syn: { ...noSyn },
  ppa: { intangPct: 40, life: 10 },
  taxRate: 25,
});

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("purchase price, consideration and financing", () => {
  const r = computeAccretion(base());
  close(r.equityPurchasePrice, 500);
  close(r.enterpriseValue, 600);
  close(r.premiumPct, 25);
  close(r.cashConsideration, 250);
  close(r.stockConsideration, 250);
  close(r.fees, 10);
  close(r.newDebt, 260);
  close(r.afterTaxInterest, 260 * 0.08 * 0.75);
  close(r.newSharesIssued, 5);
});

test("purchase price allocation", () => {
  const r = computeAccretion(base());
  close(r.targetBookValue, 200);
  close(r.excessPurchasePrice, 300);
  close(r.identifiedIntangibles, 120);
  close(r.goodwill, 180);
  close(r.annualAmortization, 12);
});

test("pro-forma EPS, accretion and breakeven synergies", () => {
  const r = computeAccretion(base());
  // NI = 500 + 40 + (0 - 20.8 - 12) * 0.75 = 515.4 ; shares = 105
  close(r.proFormaNetIncome, 515.4);
  close(r.proFormaShares, 105);
  close(r.standaloneEPS, 5);
  close(r.proFormaEPS, 515.4 / 105);
  close(r.accretionPct, (515.4 / 105 / 5 - 1) * 100);
  assert.equal(r.accretive, false);
  close(r.targetOwnershipPct, (5 / 105) * 100);
  // Need NI 525: (525 - 540)/0.75 + 20.8 + 12 = 12.8
  close(r.breakevenSynergies, 12.8);

  const atBreakeven = computeAccretion({ ...base(), syn: { ...noSyn, hc: r.breakevenSynergies } });
  close(atBreakeven.accretionPct, 0);
});

test("synergies apply realization rates; integration costs stay out of run-rate EPS", () => {
  const i = base();
  i.syn = { ...noSyn, cSell: 10, geo: 10, rR: 50, hc: 20, it: 20, cR: 75, sev: 5, itI: 5, leg: 5 };
  const r = computeAccretion(i);
  close(r.revenueSynergies, 10);
  close(r.costSynergies, 30);
  close(r.totalSynergies, 40);
  close(r.integrationCosts, 15);
  close(r.proFormaNetIncome, 515.4 + 40 * 0.75);
  assert.equal(r.accretive, true);
});

test("all-stock deal issues shares and adds no debt", () => {
  const i = base();
  i.deal = { ...i.deal, cashPct: 0, stockPct: 100, fees: 0 };
  const r = computeAccretion(i);
  close(r.newDebt, 0);
  close(r.newSharesIssued, 10);
});

test("bargain purchase books no goodwill or amortization", () => {
  const i = base();
  i.target = { ...i.target, bookValuePerShare: 40 };
  const r = computeAccretion(i);
  close(r.excessPurchasePrice, 0);
  close(r.goodwill, 0);
  close(r.annualAmortization, 0);
});

test("loss-making acquirer flags accretion as not meaningful", () => {
  const i = base();
  i.acquirer = { ...i.acquirer, netIncome: -50 };
  const r = computeAccretion(i);
  assert.equal(r.meaningful, false);
  assert.ok(Number.isNaN(r.accretionPct));
  assert.equal(r.accretive, false);
});
