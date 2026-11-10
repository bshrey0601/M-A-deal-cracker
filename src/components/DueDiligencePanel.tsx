import React from "react";
import { CompanyData, DDFlag } from "../types";
import { cn } from "../lib/utils";
import { ExternalLink, ShieldAlert } from "lucide-react";

const SEV: Record<DDFlag["severity"], { label: string; cls: string; order: number }> = {
  high: { label: "Red flag", cls: "border-accent-red/40 bg-accent-red/10 text-accent-red", order: 0 },
  medium: { label: "Review", cls: "border-accent-orange/40 bg-accent-orange/10 text-accent-orange", order: 1 },
  low: { label: "Minor", cls: "border-border-alt bg-bg text-text-secondary", order: 2 },
  ok: { label: "Clear", cls: "border-accent-green/30 bg-accent-green/10 text-accent-green", order: 3 },
  na: { label: "No data", cls: "border-border-alt bg-bg text-text-muted", order: 4 },
};

function Column({ company, role }: { company: CompanyData; role: string }) {
  const dd = company.dueDiligence;
  return (
    <div className="bg-bg-card border border-border-alt rounded-xl p-5">
      <p className="text-[8px] uppercase font-black tracking-[3px] text-zinc-500 mb-1">{role}</p>
      <h4 className="text-sm font-bold text-text-primary mb-3">{company.name}</h4>
      {!dd ? (
        <p className="text-[11px] text-text-muted">
          Automated due diligence runs on companies that file with the SEC. {company.source?.secUnavailable ? `SEC filings could not be loaded (${company.source.secUnavailable}).` : ""}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {[...dd.flags].sort((a, b) => SEV[a.severity].order - SEV[b.severity].order).map(f => (
            <li key={f.id} className="text-[11px] leading-relaxed">
              <div className="flex items-center gap-2">
                <span className={cn("shrink-0 text-[9px] font-bold uppercase border rounded px-1.5 py-0.5", SEV[f.severity].cls)}>{SEV[f.severity].label}</span>
                <span className="font-medium text-text-primary">{f.title}</span>
              </div>
              <p className="text-text-secondary mt-0.5">{f.detail}</p>
              {f.links && f.links.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[10px]">
                  {f.links.slice(0, 6).map(l => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent-blue hover:underline">
                      {l.label} <ExternalLink size={9} />
                    </a>
                  ))}
                  {f.links.length > 6 && <span className="text-text-muted">+{f.links.length - 6} more</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Automated due-diligence red flags for both companies, from SEC filings. */
export function DueDiligencePanel({ target, acquirer }: { target: CompanyData; acquirer: CompanyData }) {
  const highs = [target, acquirer].flatMap(c => c.dueDiligence?.flags.filter(f => f.severity === "high") ?? []).length;
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-accent-blue flex items-center gap-2">
          <ShieldAlert size={14} /> Due diligence red flags
        </h3>
        <span className={cn("text-[10px] font-mono", highs ? "text-accent-red" : "text-text-muted")}>
          {highs ? `${highs} red flag${highs > 1 ? "s" : ""} found` : "No red flags found"}
        </span>
      </div>
      <p className="text-[11px] text-text-muted mb-3">
        Computed from SEC filings: bankruptcy risk (Altman Z), earnings manipulation risk (Beneish M), cash backing of profit, debt load, and 8-K events, late filings and amendments over the last 3 years. These are screening signals that tell you where to look. They don't replace reading the filings.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Column company={target} role="Target" />
        <Column company={acquirer} role="Acquirer" />
      </div>
    </section>
  );
}
