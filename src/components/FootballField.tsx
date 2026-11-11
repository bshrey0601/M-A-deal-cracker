import React, { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { DealState } from "../types";
import { PRECEDENTS } from "../constants";
import { footballField } from "../lib/footballField";

/** Football field chart: implied value per target share by method, against the offer and today's price. */
export function FootballField({ state }: { state: DealState }) {
  const t = state.target!;
  const rows = useMemo(() => footballField(state, [...PRECEDENTS, ...state.livePrecedents]), [state]);
  const offer = state.deal.offer;
  const price = t.currentPrice;

  if (!rows.length) return null;

  const vals = [...rows.flatMap(r => [r.low, r.high]), offer, price].filter(Number.isFinite);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.1 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const x = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const money = (v: number) => `${t.currency}${v.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const offerIn = rows.filter(r => offer >= r.low && offer <= r.high).length;

  return (
    <section className="bg-bg-card border border-border-alt rounded-2xl p-6" aria-label="Football field valuation">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="text-xs font-bold uppercase tracking-[4px] text-accent-blue flex items-center gap-2">
          <BarChart3 size={14} /> Football Field
        </h3>
        <div className="flex items-center gap-4 text-[10px] font-mono text-text-muted">
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-accent-orange" /> Offer {money(offer)}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 border-t border-dashed border-text-secondary" /> Today {money(price)}</span>
        </div>
      </div>
      <p className="text-xs text-text-muted mb-5">
        Implied value per {t.ticker} share by method. The offer sits inside {offerIn} of {rows.length} ranges.
      </p>

      <div className="space-y-3">
        {rows.map(r => {
          const inRange = offer >= r.low && offer <= r.high;
          return (
            <div key={r.method} className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1 items-center" title={r.basis}>
              <div className="text-[11px] text-text-secondary leading-tight">{r.method}</div>
              <div>
                <div className="relative h-6 bg-bg-alt rounded">
                  <div
                    className={`absolute top-1 bottom-1 rounded-sm anim-bar-x ${inRange ? "bg-accent-blue/70" : "bg-accent-blue/35"}`}
                    style={{ left: x(r.low), width: `max(2px, calc(${x(r.high)} - ${x(r.low)}))` }}
                  />
                  {r.mid !== undefined && Number.isFinite(r.mid) && (
                    <div className="absolute top-0.5 bottom-0.5 w-0.5 bg-text-primary" style={{ left: x(r.mid) }} title={`Mid ${money(r.mid)}`} />
                  )}
                  <div className="absolute -top-1 -bottom-1 w-0.5 bg-accent-orange" style={{ left: x(offer) }} />
                  <div className="absolute -top-1 -bottom-1 border-l border-dashed border-text-secondary" style={{ left: x(price) }} />
                </div>
                <div className="text-[10px] font-mono text-text-muted mt-0.5">
                  {money(r.low)} – {money(r.high)}
                  {r.mid !== undefined && Number.isFinite(r.mid) && <span className="text-text-secondary whitespace-nowrap"> · mid {money(r.mid)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <details className="mt-5 text-[11px] text-text-muted">
        <summary className="cursor-pointer text-text-secondary">How each range is built</summary>
        <ul className="mt-2 space-y-1 list-disc pl-5">
          {rows.map(r => <li key={r.method}><span className="text-text-secondary">{r.method}:</span> {r.basis}</li>)}
        </ul>
        <p className="mt-2">Inputs are the target's filed financials (click any figure in Fetch & Verify for its SEC source), your DCF assumptions, and the precedent deals you selected.</p>
      </details>
    </section>
  );
}
