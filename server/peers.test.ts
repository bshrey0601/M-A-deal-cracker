import { test, before } from "node:test";
import assert from "node:assert/strict";
import { secFacts } from "../src/lib/__fixtures__/secFacts";

// Target TGT (SIC 3571) and its industry: tickers, revenue (USD bn) and whether a price is available.
const CO: Record<string, { cik: number; rev?: number; ticker?: string; noPrice?: boolean; sic: string }> = {
  TGT: { cik: 100, rev: 10, ticker: "TGT", sic: "3571" },
  AAA: { cik: 101, rev: 9, ticker: "AAA", sic: "3571" },
  BBB: { cik: 102, rev: 20, ticker: "BBB", sic: "3571" },
  CCC: { cik: 103, rev: 1, ticker: "CCC", sic: "3571" },
  DDD: { cik: 104, rev: 10, sic: "3571" }, // not listed (no ticker)
  EEE: { cik: 105, ticker: "EEE", sic: "3571" }, // no revenue filed last year
  FFF: { cik: 106, rev: 11, ticker: "FFF", noPrice: true, sic: "3571" },
  GGG: { cik: 107, rev: 60, ticker: "GGG", sic: "3571" },
  HHH: { cik: 108, rev: 2, ticker: "HHH", sic: "3571" },
  III: { cik: 109, rev: 10.5, ticker: "III", sic: "3572" }, // related code in the same group
};
const pad = (c: number) => String(c).padStart(10, "0");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const listing = (sic: string) =>
  `<table class="tableFile2"><tr><th>CIK</th><th>Company</th><th>State/Country</th></tr>${Object.entries(CO)
    .filter(([, c]) => c.sic === sic)
    .map(([n, c]) => `<tr><td><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=${pad(c.cik)}">${pad(c.cik)}</a></td><td>${n} CORP</td><td>CA</td></tr>`)
    .join("")}</table>`;
const calls: string[] = [];

before(() => {
  globalThis.fetch = (async (input: any) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (/yahoo\.com/.test(url)) return new Response("Too Many Requests", { status: 429 });
    if (url.endsWith("/files/company_tickers.json")) {
      return json(Object.fromEntries(Object.values(CO).filter(c => c.ticker).map((c, i) => [i, { cik_str: c.cik, ticker: c.ticker, title: c.ticker }])));
    }
    const sic = url.match(/browse-edgar\?action=getcompany&SIC=(\d{4})/);
    if (sic) return new Response(listing(sic[1]));
    const frame = url.match(/frames\/us-gaap\/(\w+)\/USD\/CY(\d{4})\.json/);
    if (frame) {
      if (frame[2] !== "2025") return json({ data: [] });
      // Revenue split across two concepts, plus filler rows so the year counts as fully reported.
      const data = Object.values(CO)
        .filter(c => c.rev && (frame[1] === "Revenues") === (c.cik % 2 === 0))
        .map(c => ({ cik: c.cik, val: c.rev! * 1e9 }));
      for (let i = 0; i < 800; i++) data.push({ cik: 900_000 + i, val: 1e6 });
      return json({ data });
    }
    const facts = url.match(/companyfacts\/CIK(\d+)\.json/);
    if (facts) return json(secFacts());
    const subs = url.match(/submissions\/CIK(\d+)\.json/);
    if (subs) {
      const [name, c] = Object.entries(CO).find(([, c]) => c.cik === Number(subs[1]))!;
      return json({ name: `${name} CORP`, sic: c.sic, sicDescription: "Electronic Computers" });
    }
    const stooq = url.match(/stooq\.com.*s=([a-z]+)\.us/);
    if (stooq && !CO[stooq[1].toUpperCase()]?.noPrice) {
      return new Response(`Symbol,Date,Time,Open,High,Low,Close,Volume,Name\n${stooq[1].toUpperCase()}.US,2026-11-09,22:00:09,1,1,1,50,1,X\n`);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

test("peers: same SIC code, listed, closest in revenue; skips ones without data", async () => {
  const { getPeers } = await import("./peers");
  const r = await getPeers("TGT", [], 6, new Date("2026-11-10T00:00:00Z"));
  assert.equal(r.sic, "3571");
  assert.equal(r.revenueYear, 2025);
  assert.equal(r.widened, false);
  // DDD has no ticker, EEE no revenue, TGT is the target; FFF has no price and is skipped.
  assert.equal(r.candidates, 6);
  assert.deepEqual(r.peers.map(p => p.ticker), ["AAA", "BBB", "HHH", "GGG", "CCC"]);
  assert.ok(r.skipped.some(s => s.startsWith("FFF:")), r.skipped.join(" | "));
  const a = r.peers[0];
  assert.match(a.why, /Same SIC code 3571; CY2025 revenue \$9\.0B vs the target's \$10\.0B/);
  assert.equal(a.price, 50);
  assert.ok(Math.abs(a.evRevenue - (a.marketCap + a.netDebt) / a.revenue) < 1e-9);
  assert.match(a.source, /SEC EDGAR/);
  assert.ok(a.filingUrl?.startsWith("https://www.sec.gov/Archives/edgar/data/"), a.filingUrl);
  assert.ok(r.sources.some(s => s.url.includes("SIC=3571")));
});

test("peers: excluded tickers are left out and too few peers widens to the industry group", async () => {
  const { getPeers } = await import("./peers");
  const r = await getPeers("TGT", ["GGG", "BBB"], 6, new Date("2026-11-10T00:00:00Z"));
  assert.equal(r.widened, true);
  const tickers = r.peers.map(p => p.ticker);
  assert.ok(!tickers.includes("GGG") && !tickers.includes("BBB"));
  assert.deepEqual(tickers, ["AAA", "HHH", "CCC", "III"]);
  assert.match(r.peers[3].why, /Related SIC code 3572/);
});

test("peers: a ticker the SEC doesn't know gives a clear 404", async () => {
  const { getPeers } = await import("./peers");
  await assert.rejects(getPeers("NOPE.NS"), (e: any) => e.status === 404 && /not an SEC filer/.test(e.message));
});
