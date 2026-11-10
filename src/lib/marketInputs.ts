/**
 * Parsers for live cost-of-capital inputs. Pure, no network (server/marketInputs.ts fetches).
 *
 *  - Risk-free rate: 10-year US Treasury par yield (U.S. Treasury daily yield curve CSV; FRED DGS10 as fallback)
 *  - Unlevered betas by industry: Damodaran, NYU Stern (Betas.html, updated each January)
 *  - Equity risk premium and country risk premiums: Damodaran (ctryprem.html, updated January and July)
 */

export interface Sourced<T> {
  value: T;
  /** Date the figure applies to (YYYY-MM-DD) or the dataset's update label. */
  asOf: string;
  source: string;
  url: string;
}

export interface IndustryBeta {
  industry: string;
  unleveredBeta: number;
  firms?: number;
}

export interface CountryRisk {
  country: string;
  /** Total equity risk premium for the country, %. */
  erp: number;
  /** Country risk premium over a mature market, %. */
  crp: number;
}

export interface MarketInputs {
  riskFree?: Sourced<number>;
  /** Mature-market (US) equity risk premium, %. */
  erp?: Sourced<number>;
  betas?: Sourced<IndustryBeta[]>;
  countries?: Sourced<CountryRisk[]>;
  errors: string[];
}

// ---------- CSV ----------
function csvRows(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map(line => line.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
}

const isoFromUs = (d: string) => {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : d;
};

/** Latest 10-year yield from the Treasury's daily par yield curve CSV. */
export function parseTreasuryCsv(text: string): { value: number; date: string } | undefined {
  const [header, ...rows] = csvRows(text);
  const col = header?.findIndex(h => /^10 ?yr$/i.test(h));
  const dateCol = header?.findIndex(h => /^date$/i.test(h));
  if (col === undefined || col < 0 || dateCol === undefined || dateCol < 0) return undefined;
  const points = rows
    .map(r => ({ date: isoFromUs(r[dateCol]), value: Number(r[col]) }))
    .filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && r_ok(p.value))
    .sort((a, b) => b.date.localeCompare(a.date));
  return points[0];
}

const r_ok = (v: number) => Number.isFinite(v) && v > -5 && v < 30;

/** Latest value from a FRED series CSV (e.g. DGS10). Missing days are ".". */
export function parseFredCsv(text: string): { value: number; date: string } | undefined {
  const [, ...rows] = csvRows(text);
  const points = rows
    .filter(r => r[1] !== "." && r[1] !== "")
    .map(r => ({ date: r[0], value: Number(r[1]) }))
    .filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && r_ok(p.value));
  return points.sort((a, b) => b.date.localeCompare(a.date))[0];
}

// ---------- HTML tables ----------
const ENTITIES: Record<string, string> = { amp: "&", nbsp: " ", lt: "<", gt: ">", quot: '"', "#39": "'" };
const clean = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&([a-z0-9#]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();

/** All table rows in an HTML page, as arrays of cell text. */
export function tableRows(html: string): string[][] {
  const rows: string[][] = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    rows.push((tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map(clean));
  }
  return rows;
}

const pct = (s: string) => {
  const n = Number(s.replace(/[%,\s]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  // Damodaran's pages show percentages as "4.33%"; some exports give 0.0433.
  return /%/.test(s) || Math.abs(n) >= 1 ? n : n * 100;
};

function findHeader(rows: string[][], ...needles: RegExp[]) {
  const i = rows.findIndex(r => needles.every(n => r.some(c => n.test(c))));
  return i < 0 ? undefined : { index: i, cols: rows[i] };
}

/** Damodaran's US industry betas page: industry name and unlevered beta (cash-corrected when given). */
export function parseDamodaranBetas(html: string): IndustryBeta[] {
  const rows = tableRows(html);
  const h = findHeader(rows, /industry\s*name/i, /unlevered beta/i);
  if (!h) return [];
  const nameCol = h.cols.findIndex(c => /industry\s*name/i.test(c));
  const corrected = h.cols.findIndex(c => /unlevered beta corrected for cash/i.test(c));
  const betaCol = corrected >= 0 ? corrected : h.cols.findIndex(c => /^unlevered beta$/i.test(c) || /unlevered beta/i.test(c));
  const firmsCol = h.cols.findIndex(c => /number of firms/i.test(c));
  const out: IndustryBeta[] = [];
  for (const r of rows.slice(h.index + 1)) {
    const industry = r[nameCol];
    const beta = Number(r[betaCol]);
    if (!industry || !Number.isFinite(beta) || beta <= 0 || beta > 5) continue;
    if (/^total market/i.test(industry)) continue;
    out.push({ industry, unleveredBeta: beta, firms: firmsCol >= 0 ? Number(r[firmsCol]) || undefined : undefined });
  }
  return out;
}

/** Damodaran's country risk page: total ERP and country risk premium per country. */
export function parseDamodaranCountries(html: string): { countries: CountryRisk[]; matureErp?: number } {
  const rows = tableRows(html);
  const h = findHeader(rows, /^country$/i, /country risk premium/i);
  if (!h) return { countries: [] };
  const name = h.cols.findIndex(c => /^country$/i.test(c));
  const crpCol = h.cols.findIndex(c => /country risk premium/i.test(c));
  const erpCol = h.cols.findIndex(c => /(total )?equity risk premium/i.test(c) && !/country risk/i.test(c));
  const countries: CountryRisk[] = [];
  for (const r of rows.slice(h.index + 1)) {
    const country = r[name];
    const crp = pct(r[crpCol] ?? "");
    const erp = erpCol >= 0 ? pct(r[erpCol] ?? "") : NaN;
    if (!country || !Number.isFinite(crp) || crp < 0 || crp > 50) continue;
    countries.push({ country, crp, erp: Number.isFinite(erp) ? erp : NaN });
  }
  // The mature-market ERP is the total ERP of a zero-CRP country (the US).
  const us = countries.find(c => /^united states/i.test(c.country)) ?? countries.find(c => c.crp === 0 && Number.isFinite(c.erp));
  return { countries, matureErp: us && Number.isFinite(us.erp) ? us.erp : undefined };
}

/** "Updated January 2026" style label from a Damodaran page, if present. */
export function damodaranDate(html: string): string | undefined {
  const m = clean(html).match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d\d)/);
  return m ? `${m[1]} ${m[2]}` : undefined;
}
