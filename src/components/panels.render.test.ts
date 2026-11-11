import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { DealProvider } from "../context/DealContext";
import { FetchPanel } from "./panels/FetchPanel";
import { WaccPanel } from "./panels/WaccPanel";
import { PrecedentsPanel } from "./panels/PrecedentsPanel";
import { DCFPanel } from "./panels/DCFPanel";
import { AccretionPanel } from "./panels/AccretionPanel";
import { SummaryPanel } from "./panels/SummaryPanel";
import { mapSecToCompany } from "../lib/secFacts";
import { mapYahooToCompany } from "../lib/marketData";
import { secFacts, secSubmissions } from "../lib/__fixtures__/secFacts";
import { CompanyData, DealState } from "../types";
import { reviveCompany } from "../lib/revive";

// Every panel must render for awkward but real company profiles (loss-making biotech, no EBITDA,
// sparse Yahoo data for non-US tickers, healthcare sector names) without throwing: a throw blanks the app.
(globalThis as any).localStorage ??= { getItem: () => null, setItem: () => {} };
(globalThis as any).window ??= globalThis;

const sec = mapSecToCompany("EXM", secFacts(), secSubmissions(), { provider: "Stooq", price: 500, currency: "USD", time: new Date() });
const variants: Record<string, CompanyData> = {
  sec,
  healthcare: { ...sec, ticker: "HLTH", sector: "Pharmaceutical Preparations" },
  lossMaking: { ...sec, ticker: "BIO", sector: "Biological Products, (No Diagnostic Substances)", ebitda: -800, ebit: -900, netIncome: -1000, eps: -2, ebitdaMargin: -40, netMargin: -50, peRatio: NaN, evEbitda: NaN },
  noRevenue: { ...sec, ticker: "PRE", revenue: 0, ebitda: -50, ebit: -60, netIncome: -70, revenueGrowthYoY: NaN, evRevenue: NaN },
  netCash: { ...sec, ticker: "CASH", netDebt: -5000 },
  yahooSparse: mapYahooToCompany("SUNPHARMA.NS", { summary: { price: { regularMarketPrice: 1700, currency: "INR", longName: "Sun Pharmaceutical Industries" } }, annual: [], fx: 1 }),
};

const panels = { FetchPanel, WaccPanel, PrecedentsPanel, DCFPanel, AccretionPanel, SummaryPanel };

// The browser receives companies as JSON, where NaN and Infinity become null.
const overJson = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

for (const [name, raw] of Object.entries(variants)) for (const revived of [false, true]) {
  // Raw JSON (nulls) guards the formatters; revived is what the app actually stores.
  const company = revived ? reviveCompany(overJson(raw)) : overJson(raw);
  test(`every panel renders for a ${name} target${revived ? "" : " (nulls from JSON)"}`, () => {
    const initial: Partial<DealState> = {
      target: company,
      acquirer: overJson({ ...sec, ticker: "BUY", name: "Buyer" }),
      deal: { offer: (company.currentPrice || 1) * 1.25, cashPct: 60, stockPct: 40, fees: 1.5, finRate: 6 },
    };
    for (const [panel, C] of Object.entries(panels)) {
      try {
        renderToString(React.createElement(DealProvider, { initial }, React.createElement(C)));
      } catch (e: any) {
        assert.fail(`${panel} crashed for ${name}: ${e?.stack?.split("\n").slice(0, 4).join(" | ")}`);
      }
    }
  });
}

test("reviving JSON turns missing figures back into NaN, never 0", () => {
  const c = reviveCompany(overJson({ ...sec, peRatio: NaN, evEbitda: Infinity }));
  assert.ok(Number.isNaN(c.peRatio) && Number.isNaN(c.evEbitda));
  assert.equal(c.revenue, sec.revenue);
});
