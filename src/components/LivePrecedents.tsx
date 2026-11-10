import React, { useState } from "react";
import { FileSearch, Loader2, ExternalLink } from "lucide-react";
import { useDeal } from "../context/DealContext";
import { apiUrl, BACKEND_MISSING } from "../lib/api";
import { PRECEDENTS } from "../constants";
import { PrecedentDeal } from "../types";
import { fmt, fmtX } from "../lib/utils";

const mn = (v: number) => `${v < 0 ? "−" : ""}$${fmt(Math.abs(v))}M`;

interface Result {
  sic: string;
  sicDescription?: string;
  deals: PrecedentDeal[];
  skipped: string[];
  found: number;
  sources: { label: string; url: string }[];
}

/** Precedent deals read live from SEC merger filings in the target's industry, each figure quoted from its filing. */
export function LivePrecedents({ onShow }: { onShow: () => void }) {
  const { state, setState } = useDeal();
  const t = state.target!;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = state.livePrecedentsInfo;
  const live = state.livePrecedents;
  const base = PRECEDENTS.length;

  const search = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/precedents/${encodeURIComponent(t.ticker)}`));
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? (res.status === 404 && !body ? BACKEND_MISSING : `HTTP ${res.status}`));
      const r = body as Result;
      setState(prev => {
        // Replace earlier live deals and select the new ones; built-in selections stay.
        const selected = [...prev.selectedPrecedents.filter(i => i < base), ...r.deals.map((_, i) => base + i)];
        return {
          ...prev,
          livePrecedents: r.deals,
          livePrecedentsInfo: { ticker: t.ticker, sic: r.sic, sicDescription: r.sicDescription, found: r.found, skipped: r.skipped, sources: r.sources },
          selectedPrecedents: selected,
          precedentsBenchmarked: selected.length > 0,
        };
      });
      if (r.deals.length) onShow();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedLive = live.filter((_, i) => state.selectedPrecedents.includes(base + i));

  return (
    <section className="bg-bg-card border border-border-alt rounded-2xl p-6" aria-label="Precedents from SEC filings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-[4px] text-accent-blue flex items-center gap-2">
            <FileSearch size={14} /> Precedent deals from SEC filings
          </h3>
          <p className="text-xs text-text-muted mt-2 max-w-2xl">
            {info ? (
              <>
                {live.length} deal{live.length === 1 ? "" : "s"} from merger proxies (DEFM14A) and tender-offer responses (SC 14D9) filed in the last three years by companies in SIC group{" "}
                <span className="text-text-secondary">{info.sic.slice(0, 2)}xx</span> ({t.ticker} is {info.sic}{info.sicDescription ? `, ${info.sicDescription}` : ""}), out of {info.found} found.
                They are added to the table below and selected. The offer price and premium are quoted from each filing; EV/Revenue and EV/EBITDA use the acquired company's own filed financials at the offer price.
              </>
            ) : (
              <>Search the SEC's merger filings for deals in {t.ticker}'s industry. Every figure links to the filing it came from.</>
            )}
          </p>
        </div>
        <button onClick={search} disabled={loading} className="px-3 py-1.5 border border-border-alt rounded-md text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:bg-bg-alt disabled:opacity-40 flex items-center gap-2">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <FileSearch size={12} />} {info ? "Search again" : "Find deals"}
        </button>
      </div>
      {loading && <p className="text-xs text-text-muted mt-3">Searching EDGAR and reading each filing. This can take 30 seconds or more the first time.</p>}
      {error && <p className="text-xs text-accent-red mt-3">{error}</p>}
      {info && !live.length && !loading && <p className="text-xs text-text-muted mt-3">No deals with a stated per-share price were found in this industry group.</p>}

      {selectedLive.length > 0 && (
        <details className="mt-4 text-[11px] text-text-muted" open>
          <summary className="cursor-pointer text-text-secondary">What each selected filing says</summary>
          <ul className="mt-3 space-y-3">
            {selectedLive.map(d => d.sec && (
              <li key={d.sec.url} className="border-l-2 border-accent-blue/40 pl-3">
                <div className="text-text-primary font-bold">
                  {d.deal}{" "}
                  <a href={d.sec.url} target="_blank" rel="noreferrer" className="text-accent-blue font-normal hover:underline inline-flex items-center gap-1">{d.sec.form}, filed {d.sec.filed} <ExternalLink size={9} /></a>
                </div>
                <blockquote className="mt-1 italic">“{d.sec.offerQuote}”</blockquote>
                {d.sec.premiumQuote && <blockquote className="mt-1 italic">“{d.sec.premiumQuote}”</blockquote>}
                <div className="mt-1 font-mono text-[10px]">
                  Equity value {mn(d.sec.equityValue)} (offer ${fmt(d.sec.offer, 2)} × filed shares) + net debt {mn(d.sec.netDebt)} = EV {mn(d.sec.equityValue + d.sec.netDebt)} ·
                  {" "}revenue {mn(d.sec.revenue)}, EBITDA {mn(d.sec.ebitda)} ({d.sec.period}) → {d.evRev !== null ? fmtX(d.evRev) : "—"} EV/Revenue, {d.evEv !== null ? fmtX(d.evEv) : "—"} EV/EBITDA
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {info && (
        <details className="mt-3 text-[11px] text-text-muted">
          <summary className="cursor-pointer text-text-secondary">Sources and method</summary>
          <ul className="mt-2 space-y-1 list-disc pl-5">
            {info.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline">{s.label}</a></li>)}
            <li>Each acquired company's revenue, EBITDA, net debt and share count come from its own XBRL filings made before the deal filing, so the multiples reflect what was known at the time. The buyer is the first party named in the merger agreement.</li>
            <li>The EV ($Bn) column is enterprise value at the offer price. Stock deals use the "implied value per share" the filing states.</li>
            {info.skipped.length > 0 && <li>Left out: {info.skipped.join("; ")}</li>}
          </ul>
        </details>
      )}
    </section>
  );
}
