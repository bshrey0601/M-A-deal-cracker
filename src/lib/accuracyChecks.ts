import { AccuracyCheck, Citations, CompanyData } from "../types";

/**
 * Automatic accuracy checks on figures built from SEC filings. Pure functions, no network.
 * Each check says plainly what was compared and what was found, so a user can judge it.
 *
 * Tolerance: gaps above 2% are flagged (warn); larger or impossible values fail.
 */

export const TOLERANCE = 0.02;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const mn = (x: number) => `$${Math.round(x / 1e6).toLocaleString("en")} Mn`;
/** Relative gap between two numbers, against the larger magnitude. */
export const gap = (a: number, b: number) => {
  const d = Math.max(Math.abs(a), Math.abs(b));
  return d === 0 ? 0 : Math.abs(a - b) / d;
};
const DAY = 86_400_000;
const daysBetween = (from: string | Date, to: Date) => Math.floor((to.getTime() - new Date(from).getTime()) / DAY);

/** A filed value for a period, as returned by data.sec.gov (one row per filing that reported it). */
export interface FiledRow {
  start?: string;
  end: string;
  val: number;
  form?: string;
  filed?: string;
  accn?: string;
}

/** Assets must equal liabilities + equity on the balance sheet date the app uses. */
export function balanceSheetCheck(bs: {
  date?: string;
  assets?: number;
  liabilitiesAndEquity?: number;
  liabilities?: number;
  equityInclNci?: number;
  temporaryEquity?: number;
}): AccuracyCheck {
  const id = "balance-sheet";
  const label = "Balance sheet adds up";
  if (bs.assets === undefined) {
    return { id, label, status: "skipped", detail: `Total assets are not tagged for ${bs.date ?? "the latest balance sheet"}.` };
  }
  if (bs.liabilities !== undefined && bs.equityInclNci !== undefined) {
    const rhs = bs.liabilities + bs.equityInclNci + (bs.temporaryEquity ?? 0);
    const g = gap(bs.assets, rhs);
    return {
      id,
      label,
      status: g <= 0.001 ? "pass" : g <= TOLERANCE ? "warn" : "fail",
      detail:
        `As of ${bs.date}: total assets ${mn(bs.assets)} vs liabilities ${mn(bs.liabilities)} + equity ${mn(bs.equityInclNci)}` +
        (bs.temporaryEquity ? ` + temporary equity ${mn(bs.temporaryEquity)}` : "") +
        ` = ${mn(rhs)}` +
        (g <= 0.001 ? " (match)." : ` (gap ${pct(g)}; the filing may use other equity lines the app doesn't read).`),
    };
  }
  if (bs.liabilitiesAndEquity !== undefined) {
    const g = gap(bs.assets, bs.liabilitiesAndEquity);
    return {
      id,
      label,
      status: g <= 0.001 ? "pass" : "fail",
      detail: `As of ${bs.date}: total assets ${mn(bs.assets)} vs total liabilities and equity ${mn(bs.liabilitiesAndEquity)}${g <= 0.001 ? " (match)." : ` (gap ${pct(g)}).`}`,
    };
  }
  return { id, label, status: "skipped", detail: `Total liabilities are not tagged for ${bs.date}.` };
}

/**
 * Restatement check: for each period used, compare the value as first filed with the value
 * in the latest filing. A change means the company restated or recast that period.
 */
export function restatementCheck(items: { label: string; used: FiledRow[]; all: FiledRow[] }[]): AccuracyCheck {
  const id = "restatements";
  const label = "Figures match what was first filed";
  const changes: string[] = [];
  for (const { label: name, used, all } of items) {
    for (const u of used) {
      const same = all
        .filter(r => r.end === u.end && r.start === u.start && r.filed)
        .sort((a, b) => a.filed!.localeCompare(b.filed!));
      const first = same[0];
      if (first && first.filed !== u.filed && gap(first.val, u.val) > 0.005) {
        changes.push(
          `${name} for ${u.start ?? ""}${u.start ? " to " : "as of "}${u.end}: first filed as ${mn(first.val)} (${first.form} ${first.filed}), ` +
            `now ${mn(u.val)} (${u.form} ${u.filed}), a ${pct(gap(first.val, u.val))} change`,
        );
      }
    }
  }
  if (!changes.length) {
    return { id, label, status: "pass", detail: "Every period used matches the value the company first filed for it." };
  }
  return {
    id,
    label,
    status: "warn",
    detail: `The company changed earlier figures. The app uses the latest values. ${changes.join("; ")}.`,
  };
}

/** Our EPS (net income ÷ current shares) against the diluted EPS the company filed for the same period. */
export function epsCheck(computedEps: number, filedEps: number | undefined, period: string): AccuracyCheck {
  const id = "eps";
  const label = "EPS matches the filed EPS";
  if (filedEps === undefined) return { id, label, status: "skipped", detail: "The filings don't tag diluted EPS for this period." };
  const g = gap(computedEps, filedEps);
  return {
    id,
    label,
    // Current shares differ from the period's weighted-average diluted shares, so a few percent is normal.
    status: g <= TOLERANCE ? "pass" : g <= 0.1 ? "warn" : "fail",
    detail:
      `Net income ÷ shares outstanding = $${computedEps.toFixed(2)}; filed diluted EPS for ${period} = $${filedEps.toFixed(2)} (gap ${pct(g)}).` +
      (g > TOLERANCE ? " Shares outstanding today differ from the period's weighted-average diluted shares (buybacks, issuance or splits)." : ""),
  };
}

/** Current cover-page shares against the weighted-average diluted shares of the latest period. */
export function sharesCheck(current: number, weighted: number | undefined, period?: string): AccuracyCheck {
  const id = "shares";
  const label = "Share count is consistent";
  if (weighted === undefined) return { id, label, status: "skipped", detail: "Weighted-average diluted shares are not tagged." };
  const g = gap(current, weighted);
  return {
    id,
    label,
    status: g <= 0.05 ? "pass" : g <= 0.15 ? "warn" : "fail",
    detail:
      `Shares outstanding ${(current / 1e6).toFixed(1)} Mn vs weighted-average diluted shares ${(weighted / 1e6).toFixed(1)} Mn for ${period} (gap ${pct(g)}).` +
      (g > 0.15 ? " Check for a stock split, a large buyback or a share issuance." : ""),
  };
}

/** How old the latest filing used is. 10-Qs are due 40-45 days after a quarter ends. */
export function filingFreshnessCheck(latestFiled: string | undefined, periodEnd: string, now: Date): AccuracyCheck {
  const id = "filing-age";
  const label = "Financials are up to date";
  if (!latestFiled) return { id, label, status: "skipped", detail: "Filing dates are not available." };
  const age = daysBetween(periodEnd, now);
  return {
    id,
    label,
    status: age <= 140 ? "pass" : age <= 200 ? "warn" : "fail",
    detail:
      `Latest period used ends ${periodEnd} (${age} days ago), filed ${latestFiled}.` +
      (age > 140 ? " A newer 10-Q or 10-K should exist by now; the company may be late filing or the data feed is behind." : ""),
  };
}

/** How old the share price is, and whether it was typed in. */
export function priceCheck(provider: string, time: Date | undefined, now: Date): AccuracyCheck {
  const id = "price-age";
  const label = "Share price is current";
  if (provider === "entered by user") {
    return { id, label, status: "warn", detail: "The share price was typed in by the user and isn't verified against a market feed." };
  }
  if (!time) return { id, label, status: "warn", detail: `${provider} gave no timestamp for the price.` };
  const days = (now.getTime() - time.getTime()) / DAY;
  return {
    id,
    label,
    // Up to 4 days covers a weekend plus a holiday.
    status: days <= 4 ? "pass" : "warn",
    detail: `Price from ${provider} as of ${time.toISOString().slice(0, 16).replace("T", " ")} UTC${days > 4 ? ` (${Math.floor(days)} days old)` : ""}.`,
  };
}

/** Debt and cash should be read at the same balance-sheet date. */
export function datesAlignedCheck(debtDate: string | undefined, cashDate: string | undefined): AccuracyCheck {
  const id = "bs-dates";
  const label = "Debt and cash from the same date";
  if (!debtDate || !cashDate) return { id, label, status: "skipped", detail: "Debt or cash is not reported." };
  return debtDate === cashDate
    ? { id, label, status: "pass", detail: `Both as of ${cashDate}.` }
    : { id, label, status: "warn", detail: `Debt is as of ${debtDate} but cash is as of ${cashDate}, so net debt mixes two dates.` };
}

/** Values that can't be right whatever the company (e.g. operating income larger than revenue). */
export function sanityCheck(c: Pick<CompanyData, "revenue" | "ebit" | "ebitda" | "netIncome" | "da" | "capex" | "sharesOutstanding">): AccuracyCheck {
  const problems: string[] = [];
  if (!(c.revenue > 0)) problems.push("revenue is not positive");
  if (c.ebit > c.revenue) problems.push("operating income is larger than revenue");
  if (c.ebitda > c.revenue) problems.push("EBITDA is larger than revenue");
  if (c.da < 0) problems.push("D&A is negative");
  if (c.capex < 0) problems.push("CapEx is negative");
  if (!(c.sharesOutstanding > 0)) problems.push("shares outstanding is not positive");
  if (Math.abs(c.netIncome) > Math.abs(c.revenue) * 3) problems.push("net income is more than three times revenue");
  return {
    id: "sanity",
    label: "Figures are plausible",
    status: problems.length ? "fail" : "pass",
    detail: problems.length ? `Check the filing: ${problems.join("; ")}.` : "Margins, D&A, CapEx and share count are within possible ranges.",
  };
}

/** Each figure's cited filed values must add back up to the number shown. */
export function citationSumCheck(company: Pick<CompanyData, "revenue" | "ebit" | "netIncome" | "da" | "netDebt">, citations: Citations): AccuracyCheck {
  const bad: string[] = [];
  for (const k of ["revenue", "ebit", "netIncome", "da", "netDebt"] as const) {
    const c = citations[k];
    if (!c?.facts.length) continue;
    const sum = c.facts.reduce((s, f) => s + f.sign * f.value, 0) / 1e6;
    if (Math.abs(sum - company[k]) > 0.01) bad.push(`${k}: filings add to ${sum.toFixed(1)}, shown ${company[k].toFixed(1)}`);
  }
  return {
    id: "citations",
    label: "Cited filings add up to each figure",
    status: bad.length ? "fail" : "pass",
    detail: bad.length ? bad.join("; ") : "Revenue, EBIT, net income, D&A and net debt each equal the sum of their cited SEC values.",
  };
}

/** Compare our SEC-based revenue with an independent provider's trailing-twelve-month revenue. */
export function secondSourceCheck(ourRevenueMn: number, other: { provider: string; revenueMn?: number; error?: string }): AccuracyCheck {
  const id = "second-source";
  const label = "Revenue matches a second source";
  if (other.revenueMn === undefined || !(other.revenueMn > 0)) {
    return { id, label, status: "skipped", detail: `${other.provider} could not be reached to compare${other.error ? ` (${other.error})` : ""}.` };
  }
  const g = gap(ourRevenueMn, other.revenueMn);
  const fmtMn = (x: number) => `$${Math.round(x).toLocaleString("en")} Mn`;
  return {
    id,
    label,
    status: g <= TOLERANCE ? "pass" : g <= 0.1 ? "warn" : "fail",
    detail:
      `SEC filings: ${fmtMn(ourRevenueMn)}; ${other.provider}: ${fmtMn(other.revenueMn)} (gap ${pct(g)}).` +
      (g > TOLERANCE ? ` Providers sometimes use a different period or revenue definition; the SEC figure is the one filed by the company.` : ""),
  };
}

export function summarize(checks: AccuracyCheck[]) {
  const count = (s: AccuracyCheck["status"]) => checks.filter(c => c.status === s).length;
  return { pass: count("pass"), warn: count("warn"), fail: count("fail"), skipped: count("skipped") };
}
