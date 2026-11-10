import { test } from "node:test";
import assert from "node:assert/strict";
import { damodaranDate, parseDamodaranBetas, parseDamodaranCountries, parseFredCsv, parseTreasuryCsv, tableRows } from "./marketInputs";

test("Treasury par yield curve CSV: latest 10-year yield", () => {
  const csv = `Date,"1 Mo","2 Mo","3 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"
11/07/2026,4.30,4.29,4.25,4.18,4.05,3.92,3.90,3.95,4.05,4.18,4.55,4.48
11/09/2026,4.31,4.30,4.26,4.19,4.06,3.94,3.91,3.97,4.07,4.21,4.58,4.51
11/06/2026,4.29,4.28,4.24,4.17,4.04,3.90,3.88,3.93,4.03,4.15,4.52,4.46`;
  assert.deepEqual(parseTreasuryCsv(csv), { date: "2026-11-09", value: 4.21 });
});

test("Treasury CSV without a 10-year column is rejected", () => {
  assert.equal(parseTreasuryCsv("Date,1 Mo\n11/09/2026,4.3"), undefined);
});

test("FRED CSV skips missing days", () => {
  const csv = "observation_date,DGS10\n2026-11-05,4.10\n2026-11-06,4.15\n2026-11-09,.\n";
  assert.deepEqual(parseFredCsv(csv), { date: "2026-11-06", value: 4.15 });
});

const betasHtml = `<html><body><p>Date updated: January 2026</p><table>
<tr><td>Industry Name</td><td>Number of firms</td><td>Beta </td><td>D/E Ratio</td><td>Effective Tax rate</td><td>Unlevered beta</td><td>Cash/Firm value</td><td>Unlevered beta corrected for cash</td></tr>
<tr><td>Advertising</td><td>54</td><td>1.34</td><td>40.12%</td><td>5.27%</td><td>1.03</td><td>7.05%</td><td>1.11</td></tr>
<tr><td>Software (System &amp; Application)</td><td>352</td><td>1.24</td><td>3.68%</td><td>5.12%</td><td>1.20</td><td>2.10%</td><td>1.23</td></tr>
<tr><td>Total Market</td><td>5994</td><td>1.00</td><td>25%</td><td>7%</td><td>0.86</td><td>4%</td><td>0.90</td></tr>
</table></body></html>`;

test("Damodaran betas: cash-corrected unlevered beta per industry", () => {
  assert.deepEqual(parseDamodaranBetas(betasHtml), [
    { industry: "Advertising", unleveredBeta: 1.11, firms: 54 },
    { industry: "Software (System & Application)", unleveredBeta: 1.23, firms: 352 },
  ]);
  assert.equal(damodaranDate(betasHtml), "January 2026");
});

const countryHtml = `<table>
<tr><th>Country</th><th>Moody's rating</th><th>Rating-based Default Spread</th><th>Total Equity Risk Premium</th><th>Country Risk Premium</th></tr>
<tr><td>India</td><td>Baa3</td><td>2.31%</td><td>7.16%</td><td>2.83%</td></tr>
<tr><td>United States</td><td>Aa1</td><td>0.00%</td><td>4.33%</td><td>0.00%</td></tr>
<tr><td>Germany</td><td>Aaa</td><td>0.00%</td><td>4.33%</td><td>0.00%</td></tr>
</table>`;

test("Damodaran country risk: CRP per country and the mature-market ERP", () => {
  const { countries, matureErp } = parseDamodaranCountries(countryHtml);
  assert.deepEqual(countries[0], { country: "India", erp: 7.16, crp: 2.83 });
  assert.equal(countries.length, 3);
  assert.equal(matureErp, 4.33);
});

test("unrecognised pages give nothing rather than wrong numbers", () => {
  assert.deepEqual(parseDamodaranBetas("<table><tr><td>Something</td></tr></table>"), []);
  assert.deepEqual(parseDamodaranCountries("<p>moved</p>").countries, []);
  assert.deepEqual(tableRows("<tr><td>a <b>b</b></td><td>1&nbsp;%</td></tr>"), [["a b", "1 %"]]);
});
