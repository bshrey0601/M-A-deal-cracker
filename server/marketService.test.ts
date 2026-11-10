import { test, before } from "node:test";
import assert from "node:assert/strict";
import { secFacts } from "../src/lib/__fixtures__/secFacts";

// Simulates production on a cloud host: every Yahoo endpoint answers 429, SEC and Stooq work.
const calls: string[] = [];
const secUserAgents: string[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

before(() => {
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (/sec\.gov/.test(url)) secUserAgents.push(new Headers(init?.headers).get("user-agent") ?? "");
    if (/yahoo\.com/.test(url)) return new Response("Too Many Requests", { status: 429 });
    if (url.endsWith("/files/company_tickers.json")) {
      return json({
        0: { cik_str: 789019, ticker: "MSFT", title: "MICROSOFT CORP" },
        1: { cik_str: 789019, ticker: "AAL", title: "SAME FILER, CNBC PRICE" },
        2: { cik_str: 789019, ticker: "NOPX", title: "SAME FILER, NO PRICE ANYWHERE" },
      });
    }
    if (url.includes("quote.cnbc.com") && url.includes("symbols=AAL")) {
      return json({ FormattedQuoteResult: { FormattedQuote: [{ symbol: "AAL", code: 0, last: "12.34", currencyCode: "USD", name: "American Airlines" }] } });
    }
    if (url.includes("/companyfacts/CIK0000789019.json") || url.includes("/companyfacts/CIK0000320193.json")) return json(secFacts());
    if (url.includes("/submissions/CIK0000320193.json")) return json({ name: "Apple Inc." });
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
  // Without SEC_USER_AGENT the SEC still gets a contact email (it answers 403 otherwise).
  assert.ok(secUserAgents.length && secUserAgents.every(ua => /\S+@\S+\.\S+/.test(ua)), secUserAgents.join(" | "));
  // Accuracy checks run; the second-source comparison is skipped (not failed) while Yahoo blocks the server.
  const second = c.checks!.find(x => x.id === "second-source")!;
  assert.equal(second.status, "skipped");
  assert.match(second.detail, /Yahoo Finance could not be reached/);
  assert.equal(c.checks!.find(x => x.id === "citations")!.status, "pass");

  // Second request is served from cache: no new network calls.
  const n = calls.length;
  await getCompany("MSFT");
  assert.equal(calls.length, n);
});

test("CNBC supplies the price when Yahoo is blocked", async () => {
  const { getCompany } = await import("./marketService");
  const c = await getCompany("AAL");
  assert.equal(c.currentPrice, 12.34);
  assert.match(c.source!.provider, /SEC EDGAR.*CNBC/);
});

test("financials found but no price anywhere: says so, and doesn't retry Yahoo's other endpoints", async () => {
  const { getCompany, MarketDataError } = await import("./marketService");
  const before = calls.filter(u => /yahoo/.test(u)).length;
  await assert.rejects(getCompany("NOPX"), (e: any) =>
    e instanceof MarketDataError && e.needsPrice && /loaded from SEC filings, but no live price source answered/.test(e.message) && /Finnhub not configured/.test(e.message));
  assert.equal(calls.filter(u => /yahoo/.test(u)).length, before, "Yahoo skipped while cooling down");
});

test("financials found, no live price: a user-entered price completes the company", async () => {
  const { getCompany } = await import("./marketService");
  const c = await getCompany("NOPX", 25);
  assert.equal(c.currentPrice, 25);
  assert.match(c.source!.provider, /SEC EDGAR.*entered by user/);
  assert.ok(c.marketCap > 0);
});

test("diagnostics reports each source without secrets", async () => {
  const { diagnostics } = await import("./marketService");
  const d = await diagnostics();
  assert.equal(d.sources["SEC EDGAR (financials)"].ok, true);
  assert.match(d.sources["SEC EDGAR (financials)"].detail, /filed line items/);
  assert.equal(d.sources["Yahoo chart (price)"].ok, false);
  assert.match(d.sources["Yahoo chart (price)"].detail, /429/);
  assert.equal(d.sources["Stooq (price)"].ok, false);
  assert.equal(d.finnhubKeySet, false);
  assert.ok(!JSON.stringify(d).includes("token="));
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
