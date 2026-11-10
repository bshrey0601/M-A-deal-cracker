import { test } from "node:test";
import assert from "node:assert/strict";
import { footballField, percentile, priceFromMultiple } from "./footballField";
import { computeDCF } from "./dcf";
import { CompanyData, DealState, PrecedentDeal } from "../types";

const t = {
  currency: "$", currentPrice: 100, fiftyTwoWeekLow: 80, fiftyTwoWeekHigh: 130, sharesOutstanding: 10,
  revenue: 1000, ebitda: 200, netDebt: 300,
} as CompanyData;
const deals: PrecedentDeal[] = [
  { deal: "A", yr: 2023, sector: "tech", val: 1, evEv: 8, evRev: 2, prem: 20, type: "Strategic" },
  { deal: "B", yr: 2023, sector: "tech", val: 1, evEv: 12, evRev: null, prem: 40, type: "Strategic" },
  { deal: "C", yr: 2023, sector: "tech", val: 1, evEv: null, evRev: 3, prem: null, type: "Strategic" },
];
const state = {
  target: t, selectedPrecedents: [0, 1, 2],
  dcf: { bear: 2, base: 5, bull: 8, ebitM: 15, wacc: 10, tgr: 3, daPct: 4, cxPct: 5, tax: 25 },
} as unknown as DealState;
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const row = (name: string) => footballField(state, deals).find(r => r.method.startsWith(name))!;

test("multiples convert to price per share: (multiple × metric − net debt) ÷ shares", () => {
  close(priceFromMultiple(8, 200, t), (1600 - 300) / 10);
});

test("precedent EV/EBITDA range uses min, max and median of the selected deals", () => {
  const r = row("Precedents: EV/EBITDA");
  close(r.low, 130); close(r.high, 210); close(r.mid!, 170);
});

test("precedent EV/Revenue and premiums skip deals without the figure", () => {
  const rev = row("Precedents: EV/Revenue");
  close(rev.low, (2000 - 300) / 10); close(rev.high, (3000 - 300) / 10);
  const p = row("Precedents: control premium");
  close(p.low, 120); close(p.high, 140); close(p.mid!, 130);
});

test("DCF rows match the DCF engine", () => {
  const r = row("DCF (bear");
  close(r.low, computeDCF(2, state.dcf, t)!.price);
  close(r.high, computeDCF(8, state.dcf, t)!.price);
  close(r.mid!, computeDCF(5, state.dcf, t)!.price);
  const s = row("DCF sensitivity");
  close(s.low, computeDCF(5, { ...state.dcf, wacc: 11, tgr: 2.5 }, t)!.price);
  close(s.high, computeDCF(5, { ...state.dcf, wacc: 9, tgr: 3.5 }, t)!.price);
});

test("rows without data are left out", () => {
  const rows = footballField({ ...state, selectedPrecedents: [] , target: { ...t, fiftyTwoWeekHigh: 100, fiftyTwoWeekLow: 100 } } as DealState, deals);
  assert.deepEqual(rows.map(r => r.method), ["DCF (bear to bull)", "DCF sensitivity (WACC ±1%, growth ±0.5%)"]);
  assert.deepEqual(footballField({ ...state, target: null } as DealState, deals), []);
});

test("with 4+ deals the precedent range is the interquartile range, so an outlier can't stretch it", () => {
  const many: PrecedentDeal[] = [6, 8, 10, 12, 40].map((m, i) => ({ deal: `D${i}`, yr: 2024, sector: "tech", val: 1, evEv: m, evRev: null, prem: null, type: "Strategic" }));
  const r = footballField({ ...state, selectedPrecedents: [0, 1, 2, 3, 4] } as DealState, many).find(x => x.method === "Precedents: EV/EBITDA")!;
  close(percentile([6, 8, 10, 12, 40], 0.25), 8);
  close(r.low, priceFromMultiple(8, 200, t)); close(r.high, priceFromMultiple(12, 200, t)); close(r.mid!, priceFromMultiple(10, 200, t));
  assert.match(r.basis, /25th–75th percentile 8.0x–12.0x \(median 10.0x; full range 6.0x–40.0x\)/);
});
