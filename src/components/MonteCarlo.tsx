import React, { useMemo } from "react";
import { Dices } from "lucide-react";
import { useDeal } from "../context/DealContext";
import { Distribution, simulateAccretion, simulateDcf } from "../lib/monteCarlo";
import { DealState } from "../types";
import { cn, fmt } from "../lib/utils";

type MC = DealState["mc"];

/** Histogram with bars coloured by which side of a reference value (offer price, or 0% accretion) they fall. */
function Histogram({ d, refValue, refLabel, good, fmtV }: { d: Distribution; refValue: number; refLabel: string; good: "above" | "below"; fmtV: (v: number) => string }) {
  const max = Math.max(...d.bins.map(b => b.count), 1);
  const lo = d.bins[0].from;
  const hi = d.bins[d.bins.length - 1].to;
  const x = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo || 1)) * 100))}%`;
  const inRange = refValue >= lo && refValue <= hi;
  return (
    <div>
      <div className="relative h-36 mt-6 flex items-end gap-px" role="img" aria-label={`Histogram of ${d.n} simulated outcomes`}>
        {d.bins.map((b, i) => {
          const mid = (b.from + b.to) / 2;
          const isGood = good === "above" ? mid >= refValue : mid < refValue;
          return (
            <div key={i} className={cn("flex-1 rounded-t-sm", isGood ? "bg-accent-green/60" : "bg-accent-red/50")}
              style={{ height: `${(b.count / max) * 100}%` }} title={`${fmtV(b.from)} to ${fmtV(b.to)}: ${b.count} runs`} />
          );
        })}
        {inRange && (
          <div className="absolute -top-1 bottom-0 border-l-2 border-accent-orange" style={{ left: x(refValue) }}>
            <span className="absolute -top-4 left-1 text-[9px] font-mono text-accent-orange whitespace-nowrap">{refLabel}</span>
          </div>
        )}
        <div className="absolute top-0 bottom-0 border-l border-dashed border-text-primary/70" style={{ left: x(d.p50) }} title={`Median ${fmtV(d.p50)}`} />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-text-muted mt-1">
        <span>{fmtV(lo)}</span>
        <span>{fmtV(hi)}</span>
      </div>
      {!inRange && <p className="text-[10px] text-text-muted mt-1">{refLabel} is outside the chart: {refValue < lo ? "below" : "above"} 99% of outcomes.</p>}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-bg-alt border border-border-alt rounded-lg p-3">
      <div className="text-[9px] uppercase tracking-widest text-text-muted">{label}</div>
      <div className={cn("text-lg font-bold font-mono", accent ?? "text-text-primary")}>{value}</div>
    </div>
  );
}

function Setting({ label, value, step = 0.5, min = 0, max = 100, onChange, suffix }: { label: string; value: number; step?: number; min?: number; max?: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-text-secondary">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" value={value} step={step} min={min} max={max}
          onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))); }}
          className="w-16 bg-bg border border-border-alt rounded px-2 py-1 font-mono text-[11px] text-text-primary text-right outline-none focus:border-accent-blue" />
        <span className="text-text-muted w-6">{suffix}</span>
      </span>
    </label>
  );
}

function Shell({ title, children, settings }: { title: string; children: React.ReactNode; settings: React.ReactNode }) {
  return (
    <section className="bg-bg-card border border-border-alt rounded-2xl p-6" aria-label={title}>
      <h3 className="text-[10px] font-bold uppercase tracking-[4px] text-accent-blue flex items-center gap-2 mb-2">
        <Dices size={14} /> {title}
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div>{children}</div>
        <div className="space-y-2 lg:border-l lg:border-border-alt lg:pl-6">
          <div className="text-[9px] uppercase tracking-widest text-text-muted mb-1">How uncertain each input is</div>
          {settings}
        </div>
      </div>
    </section>
  );
}

const useMc = () => {
  const { state, updateSection } = useDeal();
  const set = (d: Partial<MC>) => updateSection("mc", d);
  return { state, set };
};

/** DCF value per share over thousands of random draws of growth, margin, WACC and terminal growth. */
export function DcfMonteCarlo() {
  const { state, set } = useMc();
  const t = state.target!;
  const sim = useMemo(() => simulateDcf(state, t), [state.dcf, state.deal.offer, state.mc, t]);
  const money = (v: number) => `${t.currency}${fmt(v, 2)}`;
  const offer = state.deal.offer;

  return (
    <Shell title="Monte Carlo: range of DCF values" settings={<>
      <Setting label="EBIT margin ±" suffix="pt" value={state.mc.marginSd} onChange={v => set({ marginSd: v })} max={20} />
      <Setting label="WACC ±" suffix="pt" value={state.mc.waccSd} onChange={v => set({ waccSd: v })} max={5} step={0.25} />
      <Setting label="Terminal growth ±" suffix="pt" value={state.mc.tgrSd} onChange={v => set({ tgrSd: v })} max={3} step={0.25} />
      <p className="text-[10px] text-text-muted pt-1">± values are one standard deviation. Revenue growth is drawn between your bear ({state.dcf.bear}%), base ({state.dcf.base}%) and bull ({state.dcf.bull}%) cases, most often near the base case.</p>
    </>}>
      {sim ? (
        <>
          <p className="text-xs text-text-muted mb-4">
            {sim.price.n.toLocaleString("en")} DCFs with the inputs drawn at random. In {fmt(sim.probOfferAbove * 100, 0)}% of them the offer of {money(offer)} is
            {" "}<span className="text-text-secondary">above</span> the value per share, so the buyer would pay more than the business is worth on these assumptions.
          </p>
          <Histogram d={sim.price} refValue={offer} refLabel={`Offer ${money(offer)}`} good="above" fmtV={money} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <Stat label="10th percentile" value={money(sim.price.p10)} />
            <Stat label="Median" value={money(sim.price.p50)} />
            <Stat label="90th percentile" value={money(sim.price.p90)} />
            <Stat label="Offer above value" value={`${fmt(sim.probOfferAbove * 100, 0)}%`} accent={sim.probOfferAbove > 0.5 ? "text-accent-red" : "text-accent-green"} />
          </div>
        </>
      ) : <p className="text-xs text-text-muted">Needs the target's revenue and share count.</p>}
    </Shell>
  );
}

/** EPS accretion / dilution over random draws of synergy realisation, financing rate and acquirer share price. */
export function AccretionMonteCarlo() {
  const { state, set } = useMc();
  const t = state.target!;
  const a = state.acquirer!;
  const sim = useMemo(() => simulateAccretion(state, t, a), [state.deal, state.syn, state.ppa, state.dcf.tax, state.mc, t, a]);
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${fmt(v, 1)}%`;

  return (
    <Shell title="Monte Carlo: range of EPS accretion" settings={<>
      <Setting label="Synergies, low" suffix="%" value={state.mc.synergyLow} onChange={v => set({ synergyLow: Math.min(v, state.mc.synergyHigh) })} max={200} step={5} />
      <Setting label="Synergies, high" suffix="%" value={state.mc.synergyHigh} onChange={v => set({ synergyHigh: Math.max(v, state.mc.synergyLow) })} max={200} step={5} />
      <Setting label="Financing rate ±" suffix="pt" value={state.mc.finRateSd} onChange={v => set({ finRateSd: v })} max={5} step={0.25} />
      <Setting label="Acquirer share price ±" suffix="%" value={state.mc.acquirerPriceSd} onChange={v => set({ acquirerPriceSd: v })} max={50} step={1} />
      <p className="text-[10px] text-text-muted pt-1">Synergies are realised anywhere between the low and high share of your plan. The share price sets how many new shares a stock deal issues.</p>
    </>}>
      {sim ? (
        <>
          <p className="text-xs text-text-muted mb-4">
            {sim.accretion.n.toLocaleString("en")} runs of the pro-forma EPS model. The deal is accretive in {fmt(sim.probAccretive * 100, 0)}% of them.
          </p>
          <Histogram d={sim.accretion} refValue={0} refLabel="Breakeven 0%" good="above" fmtV={pct} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <Stat label="10th percentile" value={pct(sim.accretion.p10)} />
            <Stat label="Median" value={pct(sim.accretion.p50)} />
            <Stat label="90th percentile" value={pct(sim.accretion.p90)} />
            <Stat label="Chance accretive" value={`${fmt(sim.probAccretive * 100, 0)}%`} accent={sim.probAccretive >= 0.5 ? "text-accent-green" : "text-accent-red"} />
          </div>
        </>
      ) : <p className="text-xs text-text-muted">Needs a positive acquirer EPS: accretion has no meaningful sign otherwise.</p>}
    </Shell>
  );
}
