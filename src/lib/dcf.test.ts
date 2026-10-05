import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDCF, DCFAssumptions } from "./dcf";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

const base: DCFAssumptions = { bear: 0, base: 0, bull: 0, ebitM: 20, wacc: 10, tgr: 2, daPct: 5, cxPct: 5, tax: 25 };
const co = { revenue: 1000, netDebt: 200, sharesOutstanding: 100 };

test("zero growth: FCF is flat, EV = annuity + discounted Gordon TV", () => {
  const r = computeDCF(0, base, co)!;
  // FCF = 1000 * 20% * 75% + 50 - 50 = 150 each year
  const annuity = [1, 2, 3, 4, 5].reduce((s, y) => s + 150 / 1.1 ** y, 0);
  const tv = (150 * 1.02) / (0.1 - 0.02);
  close(r.sumPV, annuity);
  close(r.pvTV, tv / 1.1 ** 5);
  close(r.EV, annuity + tv / 1.1 ** 5);
  close(r.price, (r.EV - 200) / 100);
});

test("tax, D&A and CapEx inputs drive the result", () => {
  const r0 = computeDCF(5, base, co)!;
  assert.ok(computeDCF(5, { ...base, tax: 35 }, co)!.EV < r0.EV, "higher tax lowers EV");
  assert.ok(computeDCF(5, { ...base, cxPct: 8 }, co)!.EV < r0.EV, "higher capex lowers EV");
  assert.ok(computeDCF(5, { ...base, daPct: 8 }, co)!.EV > r0.EV, "higher D&A tax shield raises EV");
});

test("WACC <= TGR is undefined", () => {
  assert.equal(computeDCF(5, { ...base, wacc: 3, tgr: 3 }, co), null);
});
