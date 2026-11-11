import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAcquirer, extractOffer, extractPremium, factsAsOf, filingDocUrl, htmlToText, parseEftsHits, toPrecedent } from "./secDeals";
import { mapSecToCompany } from "./secFacts";
import { secFacts } from "./__fixtures__/secFacts";

test("full-text search hits: accession, document, CIK, name, ticker, form, date and SIC", () => {
  const hits = parseEftsHits({
    hits: {
      hits: [
        { _id: "0001193125-24-123456:d123456ddefm14a.htm", _source: { ciks: ["0001353283"], display_names: ["Splunk Inc.  (SPLK)  (CIK 0001353283)"], form: "DEFM14A", file_date: "2023-10-20", sics: ["7372"] } },
        { _id: "0001104659-25-000001:tm251.htm", _source: { adsh: "0001104659-25-000001", ciks: ["0000000042"], display_names: ["Private Target Corp  (CIK 0000000042)"], form: "SC 14D9", file_date: "2025-02-03", sics: ["3674"] } },
        { _id: "broken" },
      ],
    },
  });
  assert.deepEqual(hits, [
    { adsh: "0001193125-24-123456", file: "d123456ddefm14a.htm", cik: 1353283, name: "Splunk Inc.", ticker: "SPLK", form: "DEFM14A", filed: "2023-10-20", sics: ["7372"] },
    { adsh: "0001104659-25-000001", file: "tm251.htm", cik: 42, name: "Private Target Corp", ticker: undefined, form: "SC 14D9", filed: "2025-02-03", sics: ["3674"] },
  ]);
  assert.equal(filingDocUrl(hits[0]), "https://www.sec.gov/Archives/edgar/data/1353283/000119312524123456/d123456ddefm14a.htm");
});

test("filing HTML to text: tags, entities and whitespace", () => {
  assert.equal(htmlToText("<p>Each share&nbsp;will be converted into the right to receive <b>$157.00</b> in cash&#8212;without interest</p><style>p{}</style>"),
    "Each share will be converted into the right to receive $157.00 in cash—without interest");
});

const proxy = htmlToText(`
  <p>This proxy statement relates to the Agreement and Plan of Merger, dated as of September 20, 2023, by and among Cisco Systems, Inc., a California corporation, Spirit Merger Corp., a Delaware corporation and a wholly owned subsidiary of Cisco, and Splunk Inc., a Delaware corporation.</p>
  <p>If the merger is completed, each share of Splunk common stock will be converted into the right to receive $157.00 in cash, without interest. The per share merger consideration represents a premium of approximately 31% over the closing price of Splunk common stock on September 20, 2023, the last trading day before the announcement.</p>
  <p>Opinion: the $150.00 per share in cash in an alternative proposal was rejected.</p>`);

test("offer price, premium and buyer are read from the filing's own sentences", () => {
  const offer = extractOffer(proxy)!;
  assert.equal(offer.value, 157);
  assert.equal(offer.kind, "cash");
  assert.match(offer.quote, /^If the merger is completed, each share of Splunk common stock will be converted into the right to receive \$157\.00 in cash, without interest\.$/);
  const prem = extractPremium(proxy)!;
  assert.equal(prem.value, 31);
  assert.match(prem.quote, /premium of approximately 31% over the closing price/);
  assert.equal(extractAcquirer(proxy, "Splunk Inc."), "Cisco Systems, Inc.");
});

test("buyer: first party of the merger agreement, never the target itself", () => {
  assert.equal(extractAcquirer("by and among Cisco Systems, Inc., a California corporation, and Splunk", "Splunk Inc."), "Cisco Systems, Inc.");
  assert.equal(extractAcquirer("by and among Splunk Inc., a Delaware corporation, Parent and Merger Sub", "Splunk Inc."), undefined);
  assert.equal(extractAcquirer("no agreement here", "X"), undefined);
});

test("tender offers and stock deals", () => {
  const tender = extractOffer("The Offer is to purchase all outstanding Shares at a price of $26.50 per Share, net to the seller in cash, without interest.")!;
  assert.equal(tender.value, 26.5);
  const stock = extractOffer("Based on the closing price, the merger consideration had an implied value of approximately $48.12 per share of Target common stock.")!;
  assert.equal(stock.value, 48.12);
  assert.equal(stock.kind, "implied");
  assert.equal(extractOffer("No price is stated."), undefined);
  assert.equal(extractPremium("No premium is stated."), undefined);
});

test("facts as of a date drop later filings, so multiples use pre-deal financials", () => {
  const before = mapSecToCompany("EXM", factsAsOf(secFacts(), "2025-08-15"), undefined, { provider: "x", price: 600, currency: "USD", time: new Date("2025-08-15") }, new Date("2025-08-15"));
  const after = mapSecToCompany("EXM", factsAsOf(secFacts(), "2025-11-15"), undefined, { provider: "x", price: 600, currency: "USD", time: new Date("2025-11-15") }, new Date("2025-11-15"));
  assert.notEqual(before.revenue, after.revenue);
  assert.equal(before.fiscalYear, "FY2025");
  assert.equal(after.fiscalYear, "LTM 2025-09-30");
});

test("precedent row: EV at the offer price over filed revenue and EBITDA, with its sources", () => {
  const c = mapSecToCompany("EXM", secFacts(), undefined, { provider: "DEFM14A offer price", price: 600, currency: "USD", time: new Date("2025-11-15") }, new Date("2025-11-15"));
  const hit = { adsh: "0001193125-25-000001", file: "d1.htm", cik: 789019, name: "Example Corp", form: "DEFM14A", filed: "2025-11-15", sics: ["7372"] };
  const d = toPrecedent(c, hit, { value: 600, kind: "cash", quote: "…$600.00 in cash…" }, { value: 25, quote: "…premium of 25%…" }, "Buyer Inc.");
  const ev = c.marketCap + c.netDebt;
  assert.equal(d.deal, "Buyer Inc. / Example Corp");
  assert.equal(d.yr, 2025);
  assert.equal(d.prem, 25);
  assert.equal(d.evRev, Math.round((ev / c.revenue) * 10) / 10);
  assert.equal(d.evEv, Math.round((ev / c.ebitda) * 10) / 10);
  assert.equal(d.val, Math.round((ev / 1000) * 100) / 100);
  assert.equal(d.sec!.url, "https://www.sec.gov/Archives/edgar/data/789019/000119312525000001/d1.htm");
  assert.equal(d.sec!.equityValue, 600 * c.sharesOutstanding);
});
