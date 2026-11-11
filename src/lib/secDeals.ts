import { CompanyData, PrecedentDeal } from "../types";
import { SecCompanyFacts } from "./secFacts";

/**
 * Precedent transactions read from SEC merger filings. Pure, no network (server/secDeals.ts fetches).
 *
 *  - Deals: EDGAR full-text search for merger proxies (DEFM14A) and tender-offer responses (SC 14D9),
 *    filed by the target, in the same SIC industry group as your target.
 *  - Offer price and premium: quoted from the filing's own text, so every figure has its sentence.
 *  - Multiples: the target's filed financials as of the filing date, valued at the offer price.
 */

export interface FilingHit {
  /** Accession number, e.g. 0001193125-24-123456. */
  adsh: string;
  /** Main document file name. */
  file: string;
  cik: number;
  name: string;
  ticker?: string;
  form: string;
  filed: string;
  sics: string[];
}

/** Hits from EDGAR full-text search (efts.sec.gov/LATEST/search-index). */
export function parseEftsHits(json: any): FilingHit[] {
  const out: FilingHit[] = [];
  for (const h of json?.hits?.hits ?? []) {
    const s = h?._source ?? {};
    const [adshFromId, file] = String(h?._id ?? "").split(":");
    const adsh = s.adsh ?? adshFromId;
    const cik = Number(s.ciks?.[0]);
    if (!adsh || !file || !cik) continue;
    // display_names look like "Splunk Inc.  (SPLK)  (CIK 0001353283)".
    const display = String(s.display_names?.[0] ?? "");
    const m = display.match(/^(.*?)\s*(?:\(([A-Z0-9.,\- ]+)\))?\s*\(CIK \d+\)\s*$/);
    out.push({
      adsh,
      file,
      cik,
      name: (m?.[1] ?? display).trim(),
      ticker: m?.[2]?.split(",")[0]?.trim() || undefined,
      form: s.form ?? s.root_form ?? "",
      filed: s.file_date ?? "",
      sics: (s.sics ?? []).map(String),
    });
  }
  return out;
}

export const filingDocUrl = (h: Pick<FilingHit, "cik" | "adsh" | "file">) =>
  `https://www.sec.gov/Archives/edgar/data/${h.cik}/${h.adsh.replace(/-/g, "")}/${h.file}`;

const ENTITIES: Record<string, string> = { amp: "&", nbsp: " ", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', mdash: "—", ndash: "–", "#160": " ", "#8217": "'", "#8220": '"', "#8221": '"', "#8212": "—", "#36": "$", "#37": "%" };

/** Filing HTML as plain text (scripts and styles dropped, entities decoded, whitespace collapsed). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&([a-z0-9#]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? (/^#\d+$/.test(e) ? String.fromCharCode(Number(e.slice(1))) : m))
    .replace(/\s+/g, " ")
    .trim();
}

/** The sentence around a match, for quoting. */
function sentence(text: string, index: number, length: number): string {
  const start = Math.max(text.lastIndexOf(". ", index) + 2, index - 280, 0);
  const endDot = text.indexOf(". ", index + length);
  const end = Math.min(endDot < 0 ? text.length : endDot + 1, index + length + 280);
  return `${start > 0 && text[start - 2] !== "." ? "…" : ""}${text.slice(start, end).trim()}${end < text.length && text[end - 1] !== "." ? "…" : ""}`;
}

const MONEY = String.raw`\$\s?(\d{1,4}(?:\.\d{1,4})?)`;
const OFFER_PATTERNS: { re: RegExp; kind: "cash" | "implied" }[] = [
  { re: new RegExp(`${MONEY}\\s+(?:per\\s+share\\s+)?in\\s+cash`, "i"), kind: "cash" },
  { re: new RegExp(`${MONEY}\\s+per\\s+(?:share|Share)[^.]{0,40}?net\\s+to\\s+the\\s+(?:seller|holder)`, "i"), kind: "cash" },
  { re: new RegExp(`${MONEY}\\s+per\\s+share[,]?\\s+(?:payable\\s+)?in\\s+cash`, "i"), kind: "cash" },
  { re: new RegExp(`(?:implied|aggregate)\\s+value\\s+of\\s+(?:approximately\\s+)?${MONEY}\\s+per\\s+share`, "i"), kind: "implied" },
];

export interface Quoted<T> {
  value: T;
  /** The filing's own sentence that states the figure. */
  quote: string;
}

/** Per-share offer price as stated in the filing (the earliest statement wins: it is the summary's). */
export function extractOffer(text: string): (Quoted<number> & { kind: "cash" | "implied" }) | undefined {
  let best: { index: number; len: number; value: number; kind: "cash" | "implied" } | undefined;
  for (const { re, kind } of OFFER_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const value = Number(m[1]);
    if (!(value > 0) || value > 5000) continue;
    if (!best || m.index < best.index) best = { index: m.index, len: m[0].length, value, kind };
  }
  return best && { value: best.value, kind: best.kind, quote: sentence(text, best.index, best.len) };
}

/** Premium over the unaffected share price as stated in the filing. */
export function extractPremium(text: string): Quoted<number> | undefined {
  const m = /premium\s+of\s+(?:approximately\s+|about\s+)?(\d{1,3}(?:\.\d+)?)\s?%\s+(?:over|to|relative\s+to|above)/i.exec(text);
  if (!m) return undefined;
  const value = Number(m[1]);
  return value > 0 && value < 500 ? { value, quote: sentence(text, m.index, m[0].length) } : undefined;
}

/** The buyer: the first party in "Agreement and Plan of Merger ... by and among X, Y and Z". */
export function extractAcquirer(text: string, targetName: string): string | undefined {
  const m = /by\s+and\s+(?:among|between)\s+([A-Z][A-Za-z0-9.,&'\- ]{1,80}?)(?:\s*\(["“][^"”]{1,30}["”]\))?\s*,\s*an?\s+(?:[A-Z][A-Za-z.]*\s+){1,3}(?:corporation|company|limited|partnership|public|société|n\.v\.|plc)/i.exec(text);
  const name = m?.[1].trim();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(incorporated|inc|corporation|corp|company|co|ltd|plc|llc|holdings)$/, "");
  if (!name || norm(name) === norm(targetName)) return undefined;
  return name;
}

/** Company facts as they stood on a date: drops every fact filed after it. */
export function factsAsOf(facts: SecCompanyFacts, isoDate: string): SecCompanyFacts {
  const out: SecCompanyFacts = { ...facts, facts: {} };
  for (const [tax, concepts] of Object.entries(facts.facts ?? {})) {
    out.facts![tax] = {};
    for (const [concept, body] of Object.entries(concepts)) {
      const units: Record<string, any[]> = {};
      for (const [unit, list] of Object.entries(body.units ?? {})) units[unit] = list.filter(f => !f.filed || f.filed <= isoDate);
      out.facts![tax][concept] = { ...body, units };
    }
  }
  return out;
}

/** A precedent row from a target valued at the offer price (its "market cap" is then the equity purchase price). */
export function toPrecedent(
  c: CompanyData,
  h: FilingHit,
  offer: Quoted<number> & { kind: "cash" | "implied" },
  premium: Quoted<number> | undefined,
  acquirer: string | undefined,
): PrecedentDeal {
  const ev = c.marketCap + c.netDebt;
  return {
    deal: `${acquirer ?? "Buyer not identified"} / ${h.name}`,
    yr: Number(h.filed.slice(0, 4)),
    sector: "sec",
    val: Math.round((ev / 1000) * 100) / 100,
    evEv: c.ebitda > 0 ? Math.round((ev / c.ebitda) * 10) / 10 : null,
    evRev: c.revenue > 0 ? Math.round((ev / c.revenue) * 10) / 10 : null,
    prem: premium ? premium.value : null,
    type: offer.kind === "cash" ? "Cash" : "Stock / mixed",
    sec: {
      form: h.form,
      filed: h.filed,
      url: filingDocUrl(h),
      target: h.name,
      acquirer,
      offer: offer.value,
      offerQuote: offer.quote,
      premiumQuote: premium?.quote,
      sic: h.sics[0],
      period: c.fiscalYear,
      equityValue: c.marketCap,
      netDebt: c.netDebt,
      revenue: c.revenue,
      ebitda: c.ebitda,
    },
  };
}
