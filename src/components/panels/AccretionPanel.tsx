import React, { useEffect, useMemo } from "react";
import { useDeal } from "../../context/DealContext";
import { computeAccretion } from "../../lib/accretion";
import { cn, fmt, fmtP, fmtX } from "../../lib/utils";
import { Scale, TrendingDown, Grid3X3, Info } from "lucide-react";

export function AccretionPanel() {
  const { state, setState, updateSection } = useDeal();
  const t = state.target;
  const a = state.acquirer;

  const res = useMemo(() => {
    if (!t || !a) return null;
    return computeAccretion({ target: t, acquirer: a, deal: state.deal, syn: state.syn, ppa: state.ppa, taxRate: state.dcf.tax });
  }, [t, a, state.deal, state.syn, state.ppa, state.dcf.tax]);

  useEffect(() => {
    if (!res) return;
    setState(prev =>
      prev.proformaCalculated && prev.ppaApplied && prev.ppaAnnualAmort === res.annualAmortization
        ? prev
        : { ...prev, proformaCalculated: true, ppaApplied: true, ppaAnnualAmort: res.annualAmortization }
    );
  }, [res, setState]);

  if (!t || !a || !res) {
    return (
      <div className="bg-accent-orange/10 border border-accent-orange/20 rounded-lg p-6 text-accent-orange flex items-center gap-3">
        <TrendingDown size={24} />
        <div>
          <h3 className="font-bold uppercase tracking-wider">Target & Acquirer Required</h3>
          <p className="text-[11px] font-mono mt-1 opacity-90">Fetch both companies first to structure the deal and run accretion/dilution.</p>
        </div>
      </div>
    );
  }

  const cur = t.currency;
  const setDeal = (d: Partial<typeof state.deal>) => updateSection("deal", d);
  const setSyn = (d: Partial<typeof state.syn>) => updateSection("syn", d);

  const premiumSteps = [10, 20, 30, 40, 50];
  const cashSteps = [0, 25, 50, 75, 100];

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-3xl font-light text-text-primary">Deal <span className="font-bold">Structuring</span></h2>
          <p className="text-text-muted text-sm italic">Consideration, Synergies, PPA & Pro-Forma EPS Accretion / Dilution</p>
        </div>
        <div className="flex gap-8">
          <div className="text-right">
            <p className="text-[10px] text-text-muted uppercase tracking-wider">Pro-Forma EPS</p>
            <p className="text-xl font-mono text-text-primary">{a.currency}{fmt(res.proFormaEPS, 2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-text-muted uppercase tracking-wider">Accretion / (Dilution)</p>
            <p className={cn("text-xl font-mono font-bold", !res.meaningful ? "text-text-muted" : res.accretive ? "text-accent-green" : "text-accent-red")}>
              {res.meaningful ? fmtP(res.accretionPct, 2) : "n/m"}
            </p>
          </div>
        </div>
      </header>

      {!res.meaningful && (
        <div className="bg-accent-orange/10 border border-accent-orange/20 rounded-xl p-4 flex gap-3 items-start text-accent-orange text-[11px] leading-relaxed">
          <Info size={16} className="shrink-0 mt-0.5" />
          <p>{a.name} has non-positive standalone net income, so EPS accretion/dilution is not meaningful. Pro-forma figures are still shown.</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 space-y-6">
          <Card title="Deal Terms">
            <div className="grid grid-cols-2 gap-4">
              <Input label={`Offer / Share (${cur})`} value={state.deal.offer} step="0.01" onChange={v => setDeal({ offer: v })} />
              <Input label="Cash Consideration %" value={state.deal.cashPct} step="1" onChange={v => {
                const c = Math.min(100, Math.max(0, v));
                setDeal({ cashPct: c, stockPct: 100 - c });
              }} />
              <Input label="Transaction Fees % of Equity" value={state.deal.fees} onChange={v => setDeal({ fees: v })} />
              <Input label="Cost of New Debt %" value={state.deal.finRate} onChange={v => setDeal({ finRate: v })} />
              <Input label="Tax Rate %" value={state.dcf.tax} onChange={v => updateSection("dcf", { tax: v })} />
            </div>
            <p className="mt-4 text-[9px] font-mono text-text-muted uppercase tracking-tight">
              Stock portion {fmt(state.deal.stockPct, 0)}% issued at {a.currency}{fmt(a.currentPrice, 2)}. Cash portion and fees assumed debt-financed.
            </p>
          </Card>

          <Card title={`Run-Rate Synergies (${cur}M, pre-tax)`}>
            <div className="text-[9px] font-mono text-accent-blue uppercase tracking-wider mb-2">Revenue</div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Cross-Sell" value={state.syn.cSell} onChange={v => setSyn({ cSell: v })} />
              <Input label="Geographic Expansion" value={state.syn.geo} onChange={v => setSyn({ geo: v })} />
              <Input label="Pricing" value={state.syn.prc} onChange={v => setSyn({ prc: v })} />
              <Input label="Bundling" value={state.syn.bnd} onChange={v => setSyn({ bnd: v })} />
              <Input label="Realization %" value={state.syn.rR} step="1" onChange={v => setSyn({ rR: v })} />
            </div>
            <div className="h-px bg-border-alt my-4 opacity-50" />
            <div className="text-[9px] font-mono text-accent-blue uppercase tracking-wider mb-2">Cost</div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Headcount" value={state.syn.hc} onChange={v => setSyn({ hc: v })} />
              <Input label="Procurement" value={state.syn.proc} onChange={v => setSyn({ proc: v })} />
              <Input label="Facilities" value={state.syn.fac} onChange={v => setSyn({ fac: v })} />
              <Input label="IT" value={state.syn.it} onChange={v => setSyn({ it: v })} />
              <Input label="Realization %" value={state.syn.cR} step="1" onChange={v => setSyn({ cR: v })} />
            </div>
            <div className="h-px bg-border-alt my-4 opacity-50" />
            <div className="text-[9px] font-mono text-accent-blue uppercase tracking-wider mb-2">One-Time Integration Costs</div>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Severance" value={state.syn.sev} onChange={v => setSyn({ sev: v })} />
              <Input label="IT Integration" value={state.syn.itI} onChange={v => setSyn({ itI: v })} />
              <Input label="Legal / Other" value={state.syn.leg} onChange={v => setSyn({ leg: v })} />
            </div>
          </Card>

          <Card title="Purchase Price Allocation">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Identified Intangibles % of Excess" value={state.ppa.intangPct} step="1" onChange={v => updateSection("ppa", { intangPct: Math.min(100, Math.max(0, v)) })} />
              <Input label="Amortization Life (yrs)" value={state.ppa.life} step="1" onChange={v => updateSection("ppa", { life: Math.max(0, v) })} />
            </div>
          </Card>
        </div>

        <div className="xl:col-span-7 space-y-6">
          <Card title="Transaction Summary">
            <Rows rows={[
              ["Equity Purchase Price", `${cur}${fmt(res.equityPurchasePrice)}M`],
              ["Implied Enterprise Value", `${cur}${fmt(res.enterpriseValue)}M`],
              ["Offer Premium", fmtP(res.premiumPct)],
              ["Implied EV / EBITDA", fmtX(res.enterpriseValue / t.ebitda)],
              ["Implied P / E", fmtX(res.equityPurchasePrice / t.netIncome)],
              ["Cash Consideration", `${cur}${fmt(res.cashConsideration)}M`],
              ["Stock Consideration", `${cur}${fmt(res.stockConsideration)}M`],
              ["Transaction Fees", `${cur}${fmt(res.fees, 1)}M`],
              ["New Debt Raised", `${cur}${fmt(res.newDebt)}M`],
              ["New Acquirer Shares Issued", `${fmt(res.newSharesIssued, 2)}M`],
              ["Target Holders' Pro-Forma Ownership", `${fmt(res.targetOwnershipPct, 1)}%`],
            ]} />
          </Card>

          <Card title="Purchase Price Allocation">
            <Rows rows={[
              ["Target Book Value of Equity", `${cur}${fmt(res.targetBookValue)}M`],
              ["Excess Purchase Price", `${cur}${fmt(res.excessPurchasePrice)}M`],
              ["Identified Intangibles", `${cur}${fmt(res.identifiedIntangibles)}M`],
              ["Goodwill (not amortized)", `${cur}${fmt(res.goodwill)}M`],
              ["Annual Intangible Amortization", `${cur}${fmt(res.annualAmortization, 1)}M`],
            ]} />
          </Card>

          <Card title="Pro-Forma EPS Bridge">
            <Rows rows={[
              [`${a.ticker} Standalone Net Income`, `${cur}${fmt(a.netIncome)}M`],
              [`${t.ticker} Net Income`, `${cur}${fmt(t.netIncome)}M`],
              ["+ Synergies (after tax)", `${cur}${fmt(res.totalSynergies * (1 - state.dcf.tax / 100), 1)}M`],
              ["− Interest on New Debt (after tax)", `${cur}${fmt(res.afterTaxInterest, 1)}M`],
              ["− Intangible Amortization (after tax)", `${cur}${fmt(res.annualAmortization * (1 - state.dcf.tax / 100), 1)}M`],
              ["Pro-Forma Net Income", `${cur}${fmt(res.proFormaNetIncome)}M`],
              ["Pro-Forma Shares", `${fmt(res.proFormaShares, 2)}M`],
              ["Standalone EPS", `${a.currency}${fmt(res.standaloneEPS, 2)}`],
              ["Pro-Forma EPS", `${a.currency}${fmt(res.proFormaEPS, 2)}`],
              ["Pre-Tax Synergies to Break Even", `${cur}${fmt(res.breakevenSynergies, 1)}M`],
              ["One-Time Integration Costs (excluded)", `${cur}${fmt(res.integrationCosts, 1)}M`],
            ]} highlight={[5, 8]} />
            <p className="mt-4 text-[9px] font-mono text-text-muted uppercase tracking-tight">
              Run-rate year: synergies at realization rates, using trailing net income for both companies.
            </p>
          </Card>

          <div className="bg-bg-card border border-border-alt rounded-xl p-5 overflow-hidden">
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-4 flex items-center gap-2">
              <Grid3X3 size={14} className="text-accent-blue" />
              Accretion / (Dilution) Sensitivity
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-center font-mono text-[10px] border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 text-text-muted border-b border-r border-border-alt text-right bg-bg-alt/30">Premium↓ / Cash→</th>
                    {cashSteps.map(c => <th key={c} className="p-3 border-b border-border-alt bg-bg-alt/50 font-bold text-text-primary">{c}%</th>)}
                  </tr>
                </thead>
                <tbody>
                  {premiumSteps.map(p => (
                    <tr key={p}>
                      <td className="p-3 text-text-muted border-r border-border-alt bg-bg-alt/50 text-right font-bold">{p}%</td>
                      {cashSteps.map(c => {
                        const r = computeAccretion({
                          target: t, acquirer: a, syn: state.syn, ppa: state.ppa, taxRate: state.dcf.tax,
                          deal: { ...state.deal, offer: t.currentPrice * (1 + p / 100), cashPct: c, stockPct: 100 - c },
                        });
                        return (
                          <td key={c} className={cn(
                            "p-3 border border-border-alt/20 font-bold",
                            !r.meaningful ? "text-text-muted" : r.accretionPct >= 0 ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"
                          )}>
                            {r.meaningful ? fmtP(r.accretionPct, 1) : "n/m"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: any) {
  return (
    <div className="bg-bg-card border border-border-alt rounded-xl p-6">
      <div className="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-6 flex items-center gap-2">
        <Scale size={12} className="text-accent-blue" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, step = "0.1" }: any) {
  return (
    <div className="space-y-2 flex-1">
      <label className="text-[9px] font-mono text-text-muted uppercase tracking-wider block opacity-70">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange?.(parseFloat(e.target.value) || 0)}
        step={step}
        className="w-full bg-bg border border-border-alt rounded-md px-3 py-2 font-mono text-[12px] text-text-primary outline-none focus:border-zinc-500 transition-all"
      />
    </div>
  );
}

function Rows({ rows, highlight = [] }: { rows: [string, string][]; highlight?: number[] }) {
  return (
    <div className="space-y-1.5">
      {rows.map(([k, v], i) => (
        <div key={k} className={cn("flex justify-between text-[11px] font-mono py-1 border-b border-border/10", highlight.includes(i) && "font-bold text-accent-blue")}>
          <span className={highlight.includes(i) ? "" : "text-text-muted"}>{k}</span>
          <span className={highlight.includes(i) ? "" : "text-text-primary"}>{v}</span>
        </div>
      ))}
    </div>
  );
}
