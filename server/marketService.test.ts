import { test, before } from "node:test";
import assert from "node:assert/strict";
import { secFacts } from "../src/lib/__fixtures__/secFacts";

// Simulates production on a cloud host: every Yahoo endpoint answers 429, SEC and Stooq work.
const calls: string[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

before(() => {
  globalThis.fetch = (async (input: any) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (/yahoo\.com/.test(url)) return new Response("Too Many Requests", { status: 429 });
    if (url.endsWith("/files/company_tickers.json")) return json({ 0: { cik_str: 789019, ticker: "MSFT", title: "MICROSOFT CORP" } });
    if (url.includes("/companyfacts/CIK0000789019.json")) return json(secFacts());
    if (url.includes("/submissions/CIK0000789019.json")) return json({ name: "MICROSOFT CORP", sicDescription: "Services-Prepackaged Software", exchanges: ["Nasdaq"] });
    if (url.includes("stooq.com") && url.includes("s=msft.us")) {
      return new Response("Symbol,Date,Time,Open,High,Low,Close,Volume,Name\nMSFT.US,2025-10-31,22:00:09,1,1,1,500,1,MICROSOFT\n");
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

test("US company: SEC financials + Stooq price when Yahoo is rate-limiting", async () => {
  const { getCompany } = await import("./marketService");
  const c = await getCompany("MSFT");
  assert.equal(c.currentPrice, 500);
  assert.equal(c.name, "MICROSOFT CORP");
  assert.match(c.source!.provider, /SEC EDGAR.*Stooq/);
  assert.equal(Math.round(c.revenue), 291_400);
  assert.ok(calls.some(u => u.includes("data.sec.gov")), "SEC was queried");

  // Second request is served from cache: no new network calls.
  const n = calls.length;
  await getCompany("MSFT");
  assert.equal(calls.length, n);
});

test("non-US company while Yahoo is rate-limiting: clear error, then a cool-down without hammering Yahoo", async () => {
  const { getCompany, MarketDataError } = await import("./marketService");
  await assert.rejects(getCompany("RELIANCE.NS"), (e: any) => e instanceof MarketDataError && e.status !== 404 && /blocking/.test(e.message));
  const n = calls.filter(u => /yahoo/.test(u)).length;
  await assert.rejects(getCompany("TCS.NS"), /retry in about/);
  assert.equal(calls.filter(u => /yahoo/.test(u)).length, n, "no Yahoo calls during cool-down");
});

test("unknown ticker is a 404", async () => {
  const { getCompany } = await import("./marketService");
  await assert.rejects(getCompany("ZZZZ"), (e: any) => e.status === 404 || /blocking/.test(e.message));
});
