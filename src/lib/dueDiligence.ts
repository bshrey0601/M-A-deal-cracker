import { CompanyData, DDFlag, DueDiligence } from "../types";
import { filingUrl, primaryDocs, SecCompanyFacts, SecFact, SecSubmissions, series } from "./secFacts";

/**
 * Automated due-diligence red flags from free SEC data (XBRL company facts + the filing index).
 * Pure: no network. Every flag says what it measured and links the filings it used.
 *
 *  - Altman Z-score (bankruptcy risk)             - Beneish M-score (earnings manipulation risk)
 *  - Accruals: profit not backed by cash          - Leverage and interest cover
 *  - 8-K events: restatements (4.02), auditor changes (4.01), bankruptcy (1.03), delisting (3.01)
 *  - Late-filing notices (NT 10-K / NT 10-Q) and amended reports (10-K/A, 10-Q/A)
 */

/** A flag plus the filed facts it used (turned into links, then dropped). */
type Flag = DDFlag & { facts?: SecFact[] };

const DAY = 86_400_000;
const t = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const days = (f: SecFact) => (f.start ? (t(f.end) - t(f.start)) / DAY : 0);
const latestFiled = (a: SecFact, b: SecFact) => (b.filed ?? "").localeCompare(a.filed ?? "");

const TAGS = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"],
  cogs: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
  ebit: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  cfo: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  sga: ["SellingGeneralAndAdministrativeExpense"],
  dep: ["Depreciation", "DepreciationDepletionAndAmortization", "DepreciationAndAmortization"],
  interest: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt"],
  assets: ["Assets"],
  currentAssets: ["AssetsCurrent"],
  currentLiabilities: ["LiabilitiesCurrent"],
  liabilities: ["Liabilities"],
  receivables: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
  ppe: ["PropertyPlantAndEquipmentNet"],
  retained: ["RetainedEarningsAccumulatedDeficit"],
  ltDebt: ["LongTermDebtNoncurrent", "LongTermDebt"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
};

type Key = keyof typeof TAGS;
const FLOWS: Key[] = ["revenue", "cogs", "ebit", "netIncome", "cfo", "sga", "dep", "interest"];

interface Year {
  end: string;
  v: Partial<Record<Key, SecFact>>;
}

/** Values for one fiscal year ending `end`: annual (10-K) durations for flows, the balance at `end` for the rest. */
function yearAt(facts: SecCompanyFacts, end: string): Year {
  const v: Year["v"] = {};
  for (const k of Object.keys(TAGS) as Key[]) {
    const rows = series(facts, TAGS[k]).filter(r => r.end === end);
    const pick = FLOWS.includes(k)
      ? rows.filter(r => r.start && days(r) >= 350 && days(r) <= 380).sort(latestFiled)[0]
      : rows.filter(r => !r.start).sort(latestFiled)[0];
    if (pick) v[k] = pick;
  }
  return { end, v };
}

/** The two latest fiscal years with reported annual revenue. */
export function lastTwoYears(facts: SecCompanyFacts): [Year, Year] | undefined {
  const annual = series(facts, TAGS.revenue).filter(r => r.start && days(r) >= 350 && days(r) <= 380);
  const ends = [...new Set(annual.map(r => r.end))].sort().reverse();
  if (!ends.length) return undefined;
  const cur = ends[0];
  const prev = ends.find(e => Math.abs(t(cur) - t(e) - 365 * DAY) <= 20 * DAY);
  if (!prev) return undefined;
  return [yearAt(facts, cur), yearAt(facts, prev)];
}

const num = (f?: SecFact) => f?.val;
const r2 = (x: number) => x.toFixed(2);

/** Altman Z (manufacturers, SIC 2000-3999) or Z'' (everyone else, uses book equity). */
export function altmanZ(y: Year, marketCapMn: number, sic?: string): Flag {
  const id = "altman-z";
  const title = "Bankruptcy risk (Altman Z-score)";
  const { assets, currentAssets, currentLiabilities, retained, ebit, liabilities, revenue, equity } = y.v;
  const TA = num(assets);
  const TL = num(liabilities) ?? (TA !== undefined && equity ? TA - equity.val : undefined);
  if (!TA || TL === undefined || currentAssets === undefined || currentLiabilities === undefined || !retained || !ebit) {
    return { id, title, severity: "na", detail: "Not enough balance-sheet data in the filings (needs current assets and liabilities, retained earnings, total liabilities)." };
  }
  const x1 = (currentAssets.val - currentLiabilities.val) / TA;
  const x2 = retained.val / TA;
  const x3 = ebit.val / TA;
  const code = Number(sic);
  const manufacturer = code >= 2000 && code <= 3999;
  let z: number, safe: number, distress: number, formula: string;
  if (manufacturer && revenue) {
    const x4 = (marketCapMn * 1e6) / TL;
    const x5 = revenue.val / TA;
    z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
    [safe, distress, formula] = [2.99, 1.81, "original Z for manufacturers (uses market value of equity)"];
  } else {
    const bookEq = equity?.val ?? TA - TL;
    const x4 = bookEq / TL;
    z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
    [safe, distress, formula] = [2.6, 1.1, "Z'' for non-manufacturers (uses book equity)"];
  }
  const severity = z < distress ? "high" : z < safe ? "medium" : "ok";
  const zone = z < distress ? "distress zone" : z < safe ? "grey zone" : "safe zone";
  return {
    id,
    title,
    severity,
    score: z,
    detail: `Z = ${r2(z)} (${zone}; safe above ${safe}, distress below ${distress}). ${formula}, fiscal year ended ${y.end}.`,
    facts: [currentAssets, currentLiabilities, retained, ebit, assets!, ...(liabilities ? [liabilities] : [])],
  };
}

/** Beneish 8-variable M-score. Above -1.78 = likely earnings manipulator; -2.22 to -1.78 = watch. */
export function beneishM(cur: Year, prev: Year): Flag {
  const id = "beneish-m";
  const title = "Earnings manipulation risk (Beneish M-score)";
  const c = cur.v, p = prev.v;
  const missing: string[] = [];
  const ratio = (name: string, f: () => number | undefined) => {
    const v = f();
    if (v === undefined || !Number.isFinite(v)) {
      missing.push(name);
      return 1; // neutral value, standard practice when an input isn't reported
    }
    return v;
  };
  const S = num(c.revenue), S1 = num(p.revenue), TA = num(c.assets), TA1 = num(p.assets);
  if (!S || !S1 || !TA || !TA1 || !c.netIncome || !c.cfo) {
    return { id, title, severity: "na", detail: "Needs two years of revenue and total assets plus net income and operating cash flow." };
  }
  const gm = (y: Year["v"], s: number) => (y.cogs ? (s - y.cogs.val) / s : undefined);
  const DSRI = ratio("receivables", () => c.receivables && p.receivables ? (c.receivables.val / S) / (p.receivables.val / S1) : undefined);
  const GMI = ratio("gross margin", () => { const a = gm(p, S1), b = gm(c, S); return a !== undefined && b ? a / b : undefined; });
  const aq = (y: Year["v"], ta: number) => (y.currentAssets && y.ppe ? 1 - (y.currentAssets.val + y.ppe.val) / ta : undefined);
  const AQI = ratio("asset quality", () => { const a = aq(c, TA), b = aq(p, TA1); return a !== undefined && b ? a / b : undefined; });
  const SGI = S / S1;
  const dr = (y: Year["v"]) => (y.dep && y.ppe ? y.dep.val / (y.dep.val + y.ppe.val) : undefined);
  const DEPI = ratio("depreciation", () => { const a = dr(p), b = dr(c); return a !== undefined && b ? a / b : undefined; });
  const SGAI = ratio("SG&A", () => c.sga && p.sga ? (c.sga.val / S) / (p.sga.val / S1) : undefined);
  const lev = (y: Year["v"], ta: number) => (y.currentLiabilities ? (y.currentLiabilities.val + (y.ltDebt?.val ?? 0)) / ta : undefined);
  const LVGI = ratio("leverage", () => { const a = lev(c, TA), b = lev(p, TA1); return a !== undefined && b ? a / b : undefined; });
  const TATA = (c.netIncome.val - c.cfo.val) / TA;
  const m = -4.84 + 0.92 * DSRI + 0.528 * GMI + 0.404 * AQI + 0.892 * SGI + 0.115 * DEPI - 0.172 * SGAI + 4.679 * TATA - 0.327 * LVGI;
  const severity = missing.length > 3 ? "na" : m > -1.78 ? "high" : m > -2.22 ? "medium" : "ok";
  const verdict = m > -1.78 ? "above -1.78: pattern seen in companies that manipulated earnings" : m > -2.22 ? "between -2.22 and -1.78: worth a closer look" : "below -2.22: no manipulation signal";
  return {
    id,
    title,
    severity,
    score: m,
    detail:
      (severity === "na" ? `Too many inputs not reported (${missing.join(", ")}); score not reliable. ` : "") +
      `M = ${r2(m)} (${verdict}), fiscal ${prev.end} → ${cur.end}. Drivers: sales growth ${r2(SGI)}, accruals ${r2(TATA)}, receivables index ${r2(DSRI)}.` +
      (missing.length && severity !== "na" ? ` Not reported, set neutral: ${missing.join(", ")}.` : "") +
      " A high score is a reason to dig deeper, not proof of fraud (high-growth companies can score high).",
    facts: [c.revenue!, p.revenue!, c.netIncome, c.cfo, c.assets!],
  };
}

/** Profit not backed by operating cash flow. */
export function accrualsFlag(y: Year): Flag {
  const id = "accruals";
  const title = "Profit backed by cash";
  const { netIncome, cfo, assets } = y.v;
  if (!netIncome || !cfo || !assets) return { id, title, severity: "na", detail: "Net income, operating cash flow or total assets not reported." };
  const ratio = (netIncome.val - cfo.val) / assets.val;
  const mn = (x: number) => `$${Math.round(x / 1e6).toLocaleString("en")}M`;
  const severity = netIncome.val > 0 && cfo.val < 0 ? "high" : ratio > 0.1 ? "medium" : "ok";
  return {
    id,
    title,
    severity,
    score: ratio,
    detail:
      `Fiscal ${y.end}: net income ${mn(netIncome.val)} vs operating cash flow ${mn(cfo.val)}; accruals = ${(ratio * 100).toFixed(1)}% of assets.` +
      (severity === "high" ? " Reported a profit but burned cash from operations." : severity === "medium" ? " Profit well above cash generated (above 10% of assets)." : ""),
    facts: [netIncome, cfo, assets],
  };
}

/** Leverage and interest cover from the company data and the latest annual interest expense. */
export function leverageFlag(c: Pick<CompanyData, "netDebt" | "ebitda" | "ebit">, y: Year): Flag {
  const id = "leverage";
  const title = "Debt load";
  const lev = c.ebitda > 0 ? c.netDebt / c.ebitda : NaN;
  const interest = y.v.interest;
  const cover = interest && interest.val > 0 ? (c.ebit * 1e6) / interest.val : undefined;
  if (c.ebitda <= 0) return { id, title, severity: "high", detail: "EBITDA is zero or negative, so the debt can't be serviced from operating earnings." };
  const severity = lev > 4 || (cover !== undefined && cover < 1.5) ? "high" : lev > 2.5 || (cover !== undefined && cover < 3) ? "medium" : "ok";
  return {
    id,
    title,
    severity,
    score: lev,
    detail:
      (c.netDebt < 0 ? "Net cash: cash exceeds debt" : `Net debt / EBITDA = ${lev.toFixed(1)}x`) +
      (cover !== undefined ? `; EBIT covers interest ${cover.toFixed(1)}x (fiscal ${y.end} interest expense)` : "; interest expense not reported") +
      ". Flags: above 2.5x leverage or below 3x cover (watch), above 4x or below 1.5x (high).",
    facts: interest ? [interest] : [],
  };
}

const EVENTS: { item: string; title: string; severity: DDFlag["severity"]; why: string }[] = [
  { item: "4.02", title: "Restatement: prior financials no longer reliable", severity: "high", why: "the company said previously issued financial statements should no longer be relied on" },
  { item: "1.03", title: "Bankruptcy or receivership", severity: "high", why: "the company reported a bankruptcy or receivership" },
  { item: "3.01", title: "Delisting notice", severity: "high", why: "the exchange notified the company it no longer meets listing rules" },
  { item: "4.01", title: "Auditor change", severity: "medium", why: "the company changed its independent auditor" },
];

/** Events in the SEC filing index over the last `years` years. */
export function filingFlags(subs: SecSubmissions | undefined, cik: number | undefined, now: Date, years = 3): Flag[] {
  const r = subs?.filings?.recent;
  if (!r?.form?.length) return [{ id: "filings", title: "Filing history", severity: "na", detail: "The SEC filing index was not available." }];
  const since = new Date(now.getTime() - years * 365 * DAY).toISOString().slice(0, 10);
  const docs = primaryDocs(subs);
  const rows = r.form
    .map((form, i) => ({ form, date: r.filingDate?.[i] ?? "", accn: r.accessionNumber?.[i] ?? "", items: r.items?.[i] ?? "" }))
    .filter(x => x.date >= since);
  const link = (x: (typeof rows)[number]) => ({ label: `${x.form} ${x.date}`, url: filingUrl(cik, x.accn, docs) ?? "" });
  const out: Flag[] = [];

  for (const e of EVENTS) {
    const hits = rows.filter(x => x.form.startsWith("8-K") && x.items.split(",").map(s => s.trim()).includes(e.item));
    out.push(
      hits.length
        ? { id: `8k-${e.item}`, title: e.title, severity: e.severity, detail: `${hits.length} filing(s) in the last ${years} years where ${e.why} (8-K item ${e.item}).`, links: hits.map(link) }
        : { id: `8k-${e.item}`, title: e.title, severity: "ok", detail: `None in the last ${years} years (8-K item ${e.item}).` },
    );
  }
  const late = rows.filter(x => /^NT 10-[KQ]/.test(x.form));
  out.push(
    late.length
      ? { id: "late", title: "Late filings", severity: "medium", detail: `${late.length} notice(s) that a 10-K or 10-Q would be filed late.`, links: late.map(link) }
      : { id: "late", title: "Late filings", severity: "ok", detail: `No late-filing notices in the last ${years} years.` },
  );
  const amended = rows.filter(x => /^10-[KQ]\/A$/.test(x.form));
  out.push(
    amended.length
      ? { id: "amended", title: "Amended reports", severity: "low", detail: `${amended.length} amended 10-K/10-Q filing(s). Often routine (e.g. adding Part III), but open them to check whether figures changed.`, links: amended.map(link) }
      : { id: "amended", title: "Amended reports", severity: "ok", detail: `No amended 10-K or 10-Q in the last ${years} years.` },
  );
  return out;
}

export function runDueDiligence(
  facts: SecCompanyFacts,
  subs: SecSubmissions | undefined,
  company: Pick<CompanyData, "marketCap" | "netDebt" | "ebitda" | "ebit">,
  now: Date = new Date(),
): DueDiligence {
  const years = lastTwoYears(facts);
  const flags: Flag[] = [];
  if (years) {
    flags.push(altmanZ(years[0], company.marketCap, subs?.sic));
    flags.push(beneishM(years[0], years[1]));
    flags.push(accrualsFlag(years[0]));
    flags.push(leverageFlag(company, years[0]));
  } else {
    flags.push({ id: "scores", title: "Financial risk scores", severity: "na", detail: "Two consecutive fiscal years of annual data were not found in the filings." });
  }
  flags.push(...filingFlags(subs, facts.cik, now));
  // Link each filed fact used to its filing on SEC.gov.
  const docs = primaryDocs(subs);
  for (const f of flags) {
    if (f.facts?.length && !f.links) {
      const seen = new Map<string, { label: string; url: string }>();
      for (const x of f.facts) {
        const url = filingUrl(facts.cik, x.accn, docs);
        if (url && x.accn && !seen.has(x.accn)) seen.set(x.accn, { label: `${x.form ?? "filing"} ${x.filed ?? ""}`.trim(), url });
      }
      f.links = [...seen.values()];
    }
    delete f.facts;
  }
  return { asOf: now.toISOString(), fiscalYear: years?.[0].end, flags };
}
