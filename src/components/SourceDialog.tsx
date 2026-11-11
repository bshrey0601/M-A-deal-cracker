import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Citation, CitedField, CompanyData, FactCitation } from "../types";
import { cn, fmt, fmtP, fmtX } from "../lib/utils";
import { ExternalLink, X } from "lucide-react";

/** Display name and formatter for each figure that can carry a citation. */
export const FIELDS: Record<CitedField, { label: string; show: (c: CompanyData) => string }> = {
  currentPrice: { label: "Share price", show: c => `${c.currency}${fmt(c.currentPrice, 2)}` },
  sharesOutstanding: { label: "Shares outstanding", show: c => `${fmt(c.sharesOutstanding, 1)} Mn` },
  marketCap: { label: "Market cap", show: c => `${c.currency}${fmt(c.marketCap)} Mn` },
  revenue: { label: "Revenue", show: c => `${c.currency}${fmt(c.revenue)} Mn` },
  revenueGrowthYoY: { label: "Revenue growth (YoY)", show: c => fmtP(c.revenueGrowthYoY, 1) },
  ebit: { label: "Operating income (EBIT)", show: c => `${c.currency}${fmt(c.ebit)} Mn` },
  da: { label: "Depreciation & amortization", show: c => `${c.currency}${fmt(c.da)} Mn` },
  ebitda: { label: "EBITDA", show: c => `${c.currency}${fmt(c.ebitda)} Mn` },
  ebitdaMargin: { label: "EBITDA margin", show: c => fmtP(c.ebitdaMargin, 1) },
  netIncome: { label: "Net income", show: c => `${c.currency}${fmt(c.netIncome)} Mn` },
  netMargin: { label: "Net margin", show: c => fmtP(c.netMargin, 1) },
  eps: { label: "EPS", show: c => `${c.currency}${fmt(c.eps, 2)}` },
  capex: { label: "Capital expenditure", show: c => `${c.currency}${fmt(c.capex)} Mn` },
  netDebt: { label: "Net debt", show: c => `${c.currency}${fmt(c.netDebt)} Mn` },
  bookValuePerShare: { label: "Book value per share", show: c => `${c.currency}${fmt(c.bookValuePerShare, 2)}` },
  dividendPerShare: { label: "Dividend per share", show: c => `${c.currency}${fmt(c.dividendPerShare, 2)}` },
  peRatio: { label: "P/E", show: c => fmtX(c.peRatio) },
  evEbitda: { label: "EV / EBITDA", show: c => fmtX(c.evEbitda) },
  evRevenue: { label: "EV / Revenue", show: c => fmtX(c.evRevenue) },
  pbRatio: { label: "P / Book", show: c => fmtX(c.pbRatio) },
};

const KIND: Record<Citation["kind"], { text: string; cls: string }> = {
  sec: { text: "Official SEC filing", cls: "border-accent-green/30 bg-accent-green/10 text-accent-green" },
  market: { text: "Market price feed", cls: "border-accent-blue/30 bg-accent-blue/10 text-accent-blue" },
  user: { text: "Entered by user", cls: "border-accent-orange/30 bg-accent-orange/10 text-accent-orange" },
  derived: { text: "Calculated", cls: "border-border-alt bg-bg text-text-secondary" },
};

/** A figure the user can click to see where it came from. */
export function Cited({ company, field, onOpen, children, className }: {
  company: CompanyData;
  field: CitedField;
  onOpen: (f: CitedField) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(field)}
      title={`Where does ${FIELDS[field].label.toLowerCase()} come from?`}
      className={cn(
        "underline decoration-dotted decoration-1 underline-offset-4 hover:decoration-solid hover:text-accent-blue cursor-pointer text-left",
        !company.citations?.[field] && "decoration-zinc-600",
        className,
      )}
    >
      {children}
    </button>
  );
}

const fmtFact = (f: FactCitation) => {
  if (f.unit === "shares") return `${fmt(f.value / 1e6, 1)} Mn shares`;
  if (f.unit === "USD/shares") return `$${fmt(f.value, 2)} per share`;
  if (f.unit === "USD") return `$${fmt(f.value / 1e6)} Mn`;
  return `${fmt(f.value)} ${f.unit}`;
};

function FactTable({ facts }: { facts: FactCitation[] }) {
  const signed = facts.some(f => f.sign === -1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-text-muted text-left border-b border-border-alt">
            {signed && <th className="py-1.5 pr-2" />}
            <th className="py-1.5 pr-3">Line item (XBRL tag)</th>
            <th className="py-1.5 pr-3">Period</th>
            <th className="py-1.5 pr-3 text-right">As filed</th>
            <th className="py-1.5 pr-3">Filing</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody>
          {facts.map((f, i) => (
            <tr key={i} className="border-b border-border-alt/40 last:border-0 align-top">
              {signed && <td className="py-1.5 pr-2 font-bold">{f.sign === -1 ? "−" : "+"}</td>}
              <td className="py-1.5 pr-3 break-all text-text-primary" title={f.concept}>{f.concept.replace(/^[a-z-]+:/, "")}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap text-text-secondary">{f.start ? `${f.start} → ${f.end}` : `as of ${f.end}`}</td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap text-text-primary" title={`${f.value.toLocaleString("en")} ${f.unit}`}>{fmtFact(f)}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap text-text-secondary">
                {f.form ?? "—"}{f.filed ? ` · filed ${f.filed}` : ""}
                {f.accn && <div className="text-[9px] text-text-muted">{f.accn}</div>}
              </td>
              <td className="py-1.5 whitespace-nowrap">
                {f.url && (
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-blue hover:underline">
                    SEC.gov <ExternalLink size={10} />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ company, field, onOpen }: { company: CompanyData; field: CitedField; onOpen: (f: CitedField) => void }) {
  const c = company.citations?.[field];
  if (!c && company.citations) {
    return (
      <p className="text-[12px] text-text-secondary leading-relaxed">
        The company's SEC filings don't report this figure, so it is shown as 0 and nothing is cited. See the notes on the company card.
      </p>
    );
  }
  if (!c) {
    const verified = company.source?.verified;
    return (
      <p className="text-[12px] text-text-secondary leading-relaxed">
        {company.source?.secUnavailable
          ? <>The company's official SEC filings could not be loaded on the server (<em>{company.source.secUnavailable}</em>), so this figure comes from <strong>{company.source.provider}</strong> and is not linked to a filing. Try again in a minute; if it keeps happening, open <code>/api/diagnostics</code> on the server to see why.</>
          : verified
          ? <>This figure comes from <strong>{company.source?.provider}</strong>. It is not linked to an official filing, so check it against the company's annual report before relying on it.</>
          : <>This figure is an <strong>AI estimate</strong>. It is not verified and has no source filing. Do not rely on it.</>}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <span className={cn("inline-block text-[9px] font-bold uppercase tracking-wider border rounded px-2 py-0.5", KIND[c.kind].cls)}>{KIND[c.kind].text}</span>
      <p className="text-[12px] text-text-secondary leading-relaxed">{c.method}</p>
      {c.facts.length > 0 && <FactTable facts={c.facts} />}
      {c.inputs && c.inputs.length > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-wider text-text-muted font-bold mb-1.5">Calculated from</p>
          <div className="flex flex-wrap gap-2">
            {c.inputs.map(i => (
              <button key={i} onClick={() => onOpen(i)} className="text-[11px] font-mono border border-border-alt rounded px-2 py-1 hover:border-accent-blue hover:text-accent-blue">
                {FIELDS[i].label}: {FIELDS[i].show(company)} →
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AllSources({ company, onOpen }: { company: CompanyData; onOpen: (f: CitedField) => void }) {
  const fields = Object.keys(FIELDS) as CitedField[];
  return (
    <table className="w-full text-[11px]">
      <tbody>
        {fields.map(f => {
          const c = company.citations?.[f];
          const filings = c ? [...new Map(c.facts.filter(x => x.url).map(x => [x.accn, x])).values()] : [];
          return (
            <tr key={f} className="border-b border-border-alt/40 last:border-0 align-top">
              <td className="py-1.5 pr-3">
                <button onClick={() => onOpen(f)} className="text-left text-text-primary hover:text-accent-blue underline decoration-dotted underline-offset-4">{FIELDS[f].label}</button>
              </td>
              <td className="py-1.5 pr-3 font-mono text-right whitespace-nowrap">{FIELDS[f].show(company)}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                {c ? <span className={cn("text-[9px] font-bold uppercase border rounded px-1.5 py-0.5", KIND[c.kind].cls)}>{KIND[c.kind].text}</span>
                   : <span className="text-[9px] uppercase text-text-muted">{company.citations ? "Not filed" : company.source?.verified ? "Not linked to a filing" : "AI estimate"}</span>}
              </td>
              <td className="py-1.5 font-mono text-[10px]">
                {filings.map(x => (
                  <a key={x.accn} href={x.url} target="_blank" rel="noopener noreferrer" className="mr-2 inline-flex items-center gap-0.5 text-accent-blue hover:underline whitespace-nowrap">
                    {x.form} {x.filed} <ExternalLink size={9} />
                  </a>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Modal showing the source of one figure, or (field = "all") every figure of a company. */
export function SourceDialog({ company, field, onOpen, onClose }: {
  company: CompanyData;
  field: CitedField | "all";
  onOpen: (f: CitedField | "all") => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal to <body> so an animated (transformed) parent can't clip or offset the overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 anim-fade" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Source of figure"
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-bg-card border border-border-alt rounded-xl p-5 shadow-2xl anim-pop"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-[9px] uppercase tracking-[3px] text-text-muted font-bold">{company.name} · {company.ticker}</p>
            <h3 className="text-lg font-bold text-text-primary">
              {field === "all" ? "All sources" : <>{FIELDS[field].label}: <span className="font-mono">{FIELDS[field].show(company)}</span></>}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {field !== "all" && (
              <button onClick={() => onOpen("all")} className="text-[10px] uppercase font-bold tracking-wider text-text-muted hover:text-accent-blue">All sources</button>
            )}
            <button onClick={onClose} aria-label="Close" className="p-1 text-text-muted hover:text-text-primary"><X size={16} /></button>
          </div>
        </div>
        {field === "all" ? <AllSources company={company} onOpen={onOpen} /> : <Detail company={company} field={field} onOpen={onOpen} />}
      </div>
    </div>,
    document.body,
  );
}
