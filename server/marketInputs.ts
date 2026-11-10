import {
  damodaranDate, MarketInputs, parseDamodaranBetas, parseDamodaranCountries, parseFredCsv, parseTreasuryCsv,
} from "../src/lib/marketInputs";

/** Live cost-of-capital inputs from official / primary sources, cached so each is fetched at most twice a day. */

const UA = "Mozilla/5.0 (compatible; MA-Deal-Cracker; +https://github.com/bshrey0601/M-A-deal-cracker)";

async function text(url: string, timeoutMs = 15_000): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e: any) {
    throw new Error(`${new URL(url).host} could not be reached (${e?.name === "TimeoutError" ? "timed out" : e?.cause?.code ?? e?.name})`);
  }
  if (!res.ok) throw new Error(`${new URL(url).host} returned HTTP ${res.status}`);
  return res.text();
}

const treasuryUrl = (year: number) =>
  `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
export const FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10";
export const BETAS_URL = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/Betas.html";
export const COUNTRY_URL = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html";

async function riskFree(now: Date): Promise<MarketInputs["riskFree"]> {
  const errors: string[] = [];
  // Early January has no rows for the new year yet: fall back to last year's file.
  for (const year of [now.getUTCFullYear(), now.getUTCFullYear() - 1]) {
    try {
      const p = parseTreasuryCsv(await text(treasuryUrl(year)));
      if (p) return { value: p.value, asOf: p.date, source: "U.S. Treasury daily par yield curve (10-year)", url: treasuryUrl(year) };
    } catch (e: any) {
      errors.push(e.message);
      break;
    }
  }
  const p = parseFredCsv(await text(FRED_URL).catch(e => { throw new Error(`${errors.join("; ")}; ${e.message}`); }));
  if (!p) throw new Error("Treasury and FRED returned no 10-year yield");
  return { value: p.value, asOf: p.date, source: "Federal Reserve (FRED DGS10, 10-year Treasury)", url: FRED_URL };
}

let cache: { exp: number; value: Promise<MarketInputs> } | undefined;

export function getMarketInputs(now = new Date()): Promise<MarketInputs> {
  if (cache && cache.exp > Date.now()) return cache.value;
  const value = (async (): Promise<MarketInputs> => {
    const out: MarketInputs = { errors: [] };
    const [rf, betasHtml, countryHtml] = await Promise.allSettled([riskFree(now), text(BETAS_URL), text(COUNTRY_URL)]);
    if (rf.status === "fulfilled") out.riskFree = rf.value;
    else out.errors.push(`Risk-free rate: ${rf.reason?.message ?? rf.reason}`);

    if (betasHtml.status === "fulfilled") {
      const betas = parseDamodaranBetas(betasHtml.value);
      if (betas.length >= 20) out.betas = { value: betas, asOf: damodaranDate(betasHtml.value) ?? "latest", source: "Damodaran, NYU Stern: US industry betas", url: BETAS_URL };
      else out.errors.push("Industry betas: page format not recognised");
    } else out.errors.push(`Industry betas: ${betasHtml.reason?.message}`);

    if (countryHtml.status === "fulfilled") {
      const { countries, matureErp } = parseDamodaranCountries(countryHtml.value);
      const asOf = damodaranDate(countryHtml.value) ?? "latest";
      if (countries.length >= 20) out.countries = { value: countries, asOf, source: "Damodaran, NYU Stern: country risk premiums", url: COUNTRY_URL };
      else out.errors.push("Country risk premiums: page format not recognised");
      if (matureErp !== undefined) out.erp = { value: matureErp, asOf, source: "Damodaran, NYU Stern: mature-market equity risk premium", url: COUNTRY_URL };
    } else out.errors.push(`Country risk premiums: ${countryHtml.reason?.message}`);
    return out;
  })();
  // Keep a good result for 12 hours; retry a failed or partial one after 10 minutes.
  cache = { exp: Date.now() + 10 * 60_000, value };
  value.then(v => {
    if (!v.errors.length && cache?.value === value) cache.exp = Date.now() + 12 * 3600_000;
  });
  return value;
}
