import { test } from "node:test";
import assert from "node:assert/strict";

test("falls back to FRED when the Treasury is down, and reports what failed", async () => {
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    if (url.includes("home.treasury.gov")) return new Response("down", { status: 503 });
    if (url.includes("fred.stlouisfed.org")) return new Response("observation_date,DGS10\n2026-11-06,4.15\n2026-11-09,.\n");
    return new Response("down", { status: 503 });
  }) as typeof fetch;
  const { getMarketInputs } = await import("./marketInputs");
  const m = await getMarketInputs(new Date("2026-11-10T00:00:00Z"));
  assert.equal(m.riskFree!.value, 4.15);
  assert.match(m.riskFree!.source, /FRED/);
  assert.equal(m.betas, undefined);
  assert.equal(m.erp, undefined);
  assert.equal(m.errors.length, 2);
  assert.match(m.errors[0], /Industry betas: pages\.stern\.nyu\.edu returned HTTP 503/);
});
