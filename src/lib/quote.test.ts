import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYahooChart, parseStooqCsv, parseFinnhubQuote, stooqSymbol } from "./quote";

test("Yahoo chart meta", () => {
  const q = parseYahooChart({ chart: { result: [{ meta: {
    currency: "USD", regularMarketPrice: 416.06, regularMarketTime: 1_760_126_400, longName: "Microsoft Corporation",
    fullExchangeName: "NasdaqGS", fiftyTwoWeekHigh: 468.35, fiftyTwoWeekLow: 324.39,
  } }], error: null } })!;
  assert.equal(q.price, 416.06);
  assert.equal(q.name, "Microsoft Corporation");
  assert.equal(q.fiftyTwoWeekLow, 324.39);
  assert.equal(q.time?.toISOString(), "2025-10-10T20:00:00.000Z");
  assert.equal(parseYahooChart({ chart: { result: null, error: { code: "Not Found" } } }), null);
});

test("Stooq CSV, including unknown symbols", () => {
  const q = parseStooqCsv("Symbol,Date,Time,Open,High,Low,Close,Volume,Name\r\nMSFT.US,2025-10-10,22:00:09,420.1,421,410.5,416.06,24000000,MICROSOFT\r\n")!;
  assert.equal(q.price, 416.06);
  assert.equal(q.time?.toISOString(), "2025-10-10T00:00:00.000Z");
  assert.equal(q.name, "MICROSOFT");
  assert.equal(parseStooqCsv("Symbol,Date,Time,Open,High,Low,Close,Volume,Name\nXXXX.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D,XXXX.US"), null);
  assert.equal(stooqSymbol("BRK-B"), "brk-b.us");
  assert.equal(stooqSymbol("RELIANCE.NS"), null);
});

test("Finnhub quote", () => {
  assert.equal(parseFinnhubQuote({ c: 416.06, t: 1_760_126_400 })?.price, 416.06);
  assert.equal(parseFinnhubQuote({ c: 0, t: 0 }), null);
});
