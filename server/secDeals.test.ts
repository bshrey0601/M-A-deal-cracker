import { test, before } from "node:test";
import assert from "node:assert/strict";
import { secFacts } from "../src/lib/__fixtures__/secFacts";

// Target TGT is in SIC 7372. EDGAR search returns deals in and out of its industry group.
const hit = (cik: number, name: string, form: string, filed: string, sic: string, file = `d${cik}.htm`) => ({
  _id: `0001193125-25-${String(cik).padStart(6, "0")}:${file}`,
  _source: { ciks: [String(cik).padStart(10, "0")], display_names: [`${name}  (CIK ${String(cik).padStart(10, "0")})`], form, file_date: filed, sics: [sic] },
});
const efts: Record<string, any[]> = {
  DEFM14A: [
    hit(201, "Alpha Software Inc.", "DEFM14A", "2025-11-15", "7372"),
    hit(202, "Beta Data Corp", "DEFM14A", "2025-08-15", "7374"), // same 2-digit group 73
    hit(203, "Gamma Steel Co", "DEFM14A", "2025-09-01", "3312"), // other industry: left out
    hit(204, "Delta Apps Inc", "DEFM14A", "2025-10-01", "7372"), // filing states no price: skipped
    hit(100, "Target Itself", "DEFM14A", "2025-10-01", "7372"), // the target: left out
  ],
  "SC 14D9": [hit(205, "Epsilon Cloud Inc", "SC 14D9", "2025-08-20", "7372")],
};
const doc: Record<number, string> = {
  201: `<p>Agreement and Plan of Merger by and among Big Buyer, Inc., a Delaware corporation, Merger Sub and Alpha Software Inc.</p><p>Each share will be converted into the right to receive $600.00 in cash, without interest. This represents a premium of approximately 25% over the unaffected closing price.</p>`,
  202: `<p>By and among Data Holdings LLC, a Delaware limited liability company, and Beta Data Corp.</p><p>Holders will receive $450.00 per share in cash.</p>`,
  204: `<p>Holders will receive shares of the buyer at a fixed exchange ratio.</p>`,
  205: `<p>The Offer price of $500.00 per Share, net to the seller in cash, represents a premium of 40% to the closing price.</p>`,
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const calls: string[] = [];

before(() => {
  globalThis.fetch = (async (input: any) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url.endsWith("/files/company_tickers.json")) return json({ 0: { cik_str: 100, ticker: "TGT", title: "TARGET" } });
    if (url.includes("/submissions/CIK0000000100.json")) return json({ name: "TARGET", sic: "7372", sicDescription: "Services-Prepackaged Software" });
    if (url.includes("efts.sec.gov")) {
      const form = new URL(url).searchParams.get("forms")!;
      const from = Number(new URL(url).searchParams.get("from"));
      return json({ hits: { hits: from === 0 ? efts[form] ?? [] : [] } });
    }
    const d = url.match(/Archives\/edgar\/data\/(\d+)\//);
    if (d && doc[Number(d[1])]) return new Response(doc[Number(d[1])]);
    if (/companyfacts\/CIK00000002\d\d\.json/.test(url)) return json(secFacts());
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

test("precedents from SEC merger filings: industry group, offer from the text, pre-deal financials", async () => {
  const { getSecPrecedents } = await import("./secDeals");
  const r = await getSecPrecedents("TGT", 10, new Date("2026-11-10T00:00:00Z"));
  assert.equal(r.sic, "7372");
  assert.equal(r.found, 4, "Gamma (other industry) and the target itself are left out");
  // Exact SIC first (newest first), then the rest of the group.
  assert.deepEqual(r.deals.map(d => d.sec!.target), ["Alpha Software Inc.", "Epsilon Cloud Inc", "Beta Data Corp"], r.skipped.join(" | "));
  assert.ok(r.skipped.some(s => s.startsWith("Delta Apps Inc") && /no per-share offer price/.test(s)), r.skipped.join(" | "));

  const [alpha, eps, beta] = r.deals;
  assert.equal(alpha.deal, "Big Buyer, Inc. / Alpha Software Inc.");
  assert.equal(alpha.prem, 25);
  assert.equal(alpha.sec!.offer, 600);
  assert.match(alpha.sec!.offerQuote, /\$600\.00 in cash, without interest/);
  assert.equal(alpha.sec!.url, "https://www.sec.gov/Archives/edgar/data/201/000119312525000201/d201.htm");
  assert.ok(alpha.evRev! > 0 && alpha.evEv! > 0);
  // Beta filed in August 2025: its financials stop before the Q1 FY2026 10-Q (filed Oct 2025).
  assert.equal(beta.sec!.period, "FY2025");
  assert.equal(alpha.sec!.period, "LTM 2025-09-30");
  assert.equal(beta.prem, null);
  assert.equal(beta.deal, "Data Holdings LLC / Beta Data Corp");
  assert.equal(eps.sec!.offer, 500);
  assert.equal(eps.prem, 40);
  assert.ok(calls.some(u => u.includes("forms=SC%2014D9")));
});

test("a ticker the SEC doesn't know gives a clear 404", async () => {
  const { getSecPrecedents } = await import("./secDeals");
  await assert.rejects(getSecPrecedents("NOPE.NS"), (e: any) => e.status === 404);
});
