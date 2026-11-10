import { test } from "node:test";
import assert from "node:assert/strict";

const rows = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join("");
const betas = `<p>January 2026</p><table><tr><td>Industry Name</td><td>Number of firms</td><td>Unlevered beta corrected for cash</td></tr>${rows(25, i => `<tr><td>Industry ${i}</td><td>10</td><td>${(0.5 + i / 50).toFixed(2)}</td></tr>`)}</table>`;
const countries = `<p>July 2026</p><table><tr><td>Country</td><td>Total Equity Risk Premium</td><td>Country Risk Premium</td></tr><tr><td>United States</td><td>4.33%</td><td>0.00%</td></tr>${rows(25, i => `<tr><td>Country ${i}</td><td>${(4.33 + i / 10).toFixed(2)}%</td><td>${(i / 10).toFixed(2)}%</td></tr>`)}</table>`;
const calls: string[] = [];

test("live inputs: Treasury 10-year when it answers, Damodaran betas and country risk", async () => {
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("home.treasury.gov")) return new Response(`Date,"10 Yr"\n11/09/2026,4.21\n`);
    if (url.endsWith("Betas.html")) return new Response(betas);
    if (url.endsWith("ctryprem.html")) return new Response(countries);
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  const { getMarketInputs } = await import("./marketInputs");
  const m = await getMarketInputs(new Date("2026-11-10T00:00:00Z"));
  assert.deepEqual(m.errors, []);
  assert.equal(m.riskFree!.value, 4.21);
  assert.equal(m.riskFree!.asOf, "2026-11-09");
  assert.match(m.riskFree!.source, /U\.S\. Treasury/);
  assert.equal(m.erp!.value, 4.33);
  assert.equal(m.betas!.value.length, 25);
  assert.equal(m.betas!.asOf, "January 2026");
  assert.equal(m.countries!.value.length, 26);
  assert.ok(!calls.some(u => u.includes("fred")), "FRED not needed");
});
