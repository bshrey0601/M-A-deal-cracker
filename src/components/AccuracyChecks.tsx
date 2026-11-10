import React, { useState } from "react";
import { AccuracyCheck, CompanyData } from "../types";
import { summarize } from "../lib/accuracyChecks";
import { cn } from "../lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

const STYLE: Record<AccuracyCheck["status"], { icon: string; cls: string }> = {
  pass: { icon: "✓", cls: "text-accent-green" },
  warn: { icon: "!", cls: "text-accent-orange" },
  fail: { icon: "✕", cls: "text-accent-red" },
  skipped: { icon: "–", cls: "text-text-muted" },
};

/** Summary of the automatic accuracy checks, expandable to each check's detail. */
export function AccuracyChecks({ company }: { company: CompanyData }) {
  const checks = company.checks;
  const n = checks ? summarize(checks) : undefined;
  const [open, setOpen] = useState(!!n && n.warn + n.fail > 0);

  if (!checks || !n) {
    return (
      <p className="mb-4 text-[10px] text-text-muted">
        Accuracy checks run on companies that file with the SEC. {company.source?.verified ? "These figures come from Yahoo Finance and are not checked against filings." : ""}
      </p>
    );
  }

  const tone = n.fail ? "border-accent-red/30 bg-accent-red/5" : n.warn ? "border-accent-orange/30 bg-accent-orange/5" : "border-accent-green/20 bg-accent-green/5";
  const parts = [
    `${n.pass} passed`,
    n.warn && `${n.warn} to review`,
    n.fail && `${n.fail} failed`,
    n.skipped && `${n.skipped} skipped`,
  ].filter(Boolean);

  return (
    <div className={cn("mb-4 rounded border text-[11px]", tone)}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-2 py-1.5 text-left" aria-expanded={open}>
        <span className="font-bold uppercase tracking-wider text-[10px] text-text-primary flex items-center gap-1">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Accuracy checks
        </span>
        <span className="font-mono text-[10px] text-text-secondary">{parts.join(" · ")}</span>
      </button>
      {open && (
        <ul className="px-2 pb-2 space-y-1.5">
          {checks.map(c => (
            <li key={c.id} className="flex gap-2">
              <span className={cn("font-bold font-mono w-3 shrink-0 text-center", STYLE[c.status].cls)} aria-label={c.status}>{STYLE[c.status].icon}</span>
              <span>
                <span className="text-text-primary font-medium">{c.label}.</span>{" "}
                <span className="text-text-secondary">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
