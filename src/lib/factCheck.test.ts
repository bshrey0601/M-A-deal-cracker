import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNumber, factCheckText, findNumbers, Fact, buildFacts, factSheet } from "./factCheck";
import { computeAccretion } from "./accretion";
import { mapSecToCompany } from "./secFacts";
import { secFacts, secSubmissions } from "./__fixtures__/secFacts";
import { DealState } from "../types";

const facts: Fact[] = [
  { label: "Implied enterprise value", value: 4586.725, kind: "money", source: "model" },
  { label: "Offer premium", value: 25, kind: "pct", source: "model" },
  { label: "EV/EBITDA paid", value: 26.74, kind: "multiple", source: "model" },
  { label: "Pro-forma EPS", value: 14.0993, kind: "perShare", source: "model" },
  { label: "EPS accretion / dilution", value: -2.31, kind: "pct", source: "model" },
  { label: "Target revenue", value: 291_400, kind: "money", source: "SEC filing" },
];

test("finds numbers with their units", () => {
  const t = findNumbers("EV of $4.6 billion (26.7x EBITDA), a 25% premium, EPS $14.10, revenue $291,400M.");
  assert.deepEqual(t.map(x => [x.text, x.unit, x.scale]), [
    ["$4.6 billion", "money", 1000],
    ["26.7x", "multiple", undefined],
    ["25%", "pct", undefined],
    ["$14.10", "money", undefined],
    ["$291,400M", "money", 1],
  ]);
});

test("ignores identifiers, years and small counts", () => {
  const checked = factCheckText("In FY2025 the 10-K and Q3 filings show the top 3 risks over a 5-year plan in 2026.", facts);
  assert.ok(checked.every(c => c.status === "ignored"), JSON.stringify(checked));
});

test("verifies numbers that match the fact sheet at the precision written", () => {
  const checked = factCheckText("An EV of $4.6 billion, or $4,586.7M, is 26.7x EBITDA and a 25% premium; EPS of $14.10 is 2.3% dilutive.", facts);
  assert.deepEqual(checked.map(c => [c.text, c.status, c.fact?.label]), [
    ["$4.6 billion", "verified", "Implied enterprise value"],
    ["$4,586.7M", "verified", "Implied enterprise value"],
    ["26.7x", "verified", "EV/EBITDA paid"],
    ["25%", "verified", "Offer premium"],
    ["$14.10", "verified", "Pro-forma EPS"],
    ["2.3%", "verified", "EPS accretion / dilution"],
  ]);
});

test("flags invented or wrong numbers", () => {
  const checked = factCheckText("The deal unlocks $750M of synergies at 31.2x EBITDA, a 40% premium, with EPS of $15.20 and EV of $5.1 billion.", facts);
  assert.deepEqual(checked.filter(c => c.status === "unverified").map(c => c.text), ["$750M", "31.2x", "40%", "$15.20", "$5.1 billion"]);
});

test("a percentage never matches a multiple or money figure", () => {
  assert.equal(checkNumber(findNumbers("26.7%")[0], facts).status, "unverified");
  assert.equal(checkNumber(findNumbers("25x")[0], facts).status, "unverified");
});

test("builds a fact sheet from a real deal state and every listed figure verifies", () => {
  const t = mapSecToCompany("EXM", secFacts(), secSubmissions(), { provider: "Stooq", price: 500, currency: "USD", time: new Date() });
  const state: DealState = {
    target: t, acquirer: { ...t, name: "Buyer", ticker: "BUY" },
    wacc: 9.1, waccCalibrated: true, cfVerified: { t: true, a: true }, ppaApplied: true, ppaAnnualAmort: 0,
    ppa: { intangPct: 30, life: 10 }, precedentsBenchmarked: false, proformaCalculated: false, thesisGenerated: false,
    deal: { offer: 625, cashPct: 50, stockPct: 50, fees: 2, finRate: 6 },
    dcf: { bear: 5, base: 10, bull: 15, ebitM: 45, wacc: 9, tgr: 3, daPct: 12, cxPct: 22, tax: 21 },
    syn: { cSell: 100, geo: 50, prc: 0, bnd: 0, rR: 50, hc: 200, proc: 100, fac: 50, it: 50, cR: 80, sev: 100, itI: 50, leg: 25 },
    selectedPrecedents: [],
  };
  const acc = computeAccretion({ target: t, acquirer: state.acquirer!, deal: state.deal, syn: state.syn, ppa: state.ppa, taxRate: 21 });
  const f = buildFacts(state, acc);
  assert.ok(f.length > 50);
  assert.equal(f.find(x => x.label === "Target revenue")!.source, "SEC filing");
  // The prompt's fact sheet, read back through the checker, verifies line by line.
  const sheet = factSheet(f, "$");
  for (const line of sheet.split("\n")) {
    const value = line.slice(line.lastIndexOf(": ") + 2);
    const nums = factCheckText(value, f);
    assert.equal(nums.length, 1, line);
    assert.notEqual(nums[0].status, "unverified", line);
  }
});
