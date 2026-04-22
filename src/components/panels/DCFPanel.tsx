import React, { useMemo } from "react";
import { useDeal } from "../../context/DealContext";
import { cn, fmt, fmtP, fmtX } from "../../lib/utils";
import { BarChart2, TrendingUp, TrendingDown, Settings, Grid3X3 } from "lucide-react";

export function DCFPanel() {
  const { state, updateSection } = useDeal();
  const t = state.target;

  React.useEffect(() => {
    if (t && !state.proformaCalculated) {
      updateSection("proformaCalculated", true as any);
    }
  }, [t, state.proformaCalculated, updateSection]);

  if (!t) {
    return (
      <div className="bg-accent-orange/10 border border-accent-orange/20 rounded-lg p-6 text-accent-orange flex items-center gap-3">
        <TrendingDown size={24} />
        <div>
          <h3 className="font-bold uppercase tracking-wider">Market Data Required</h3>
          <p className="text-[11px] font-mono mt-1 opacity-90">Please fetch company data first to generate the DCF model. Calibrate WACC for 85%+ accuracy.</p>
        </div>
      </div>
    );
  }

  const computeDCF = (growth: number) => {
    const d = state.dcf;
    const wacc = d.wacc / 100;
    const tgr = d.tgr / 100;
    const tax = d.tax / 100;
    
    if (wacc <= tgr) return null;
    
    const daP = d.daPct / 100;
    const cxP = d.cxPct / 100;
    const eM = d.ebitM / 100;
    
    let rev = t.revenue;
    let sumPV = 0;
    let lastFCF = 0;
    
    for (let y = 1; y <= 5; y++) {
      rev *= (1 + growth / 100);
      const fcf = rev * eM * (1 - tax) + rev * daP - rev * cxP;
      sumPV += fcf / Math.pow(1 + wacc, y);
      lastFCF = fcf;
    }
    
    const tv = lastFCF * (1 + tgr) / (wacc - tgr);
    const pvTV = tv / Math.pow(1 + wacc, 5);
    const EV = sumPV + pvTV;
    const eq = EV - t.netDebt;
    const price = eq / t.sharesOutstanding;
    
    return { EV, eq, price, sumPV, pvTV, tvPct: pvTV / EV * 100 };
  };

  const scenarios = [
    { n: "Bear Case", k: "bear", col: "#ff3557" },
    { n: "Base Case", k: "base", col: "#ffaa00" },
    { n: "Bull Case", k: "bull", col: "#00e07a" }
  ];

  const results = scenarios.map(sc => ({
    ...sc,
    ...(computeDCF((state.dcf as any)[sc.k]) || { error: true })
  }));

  const waccSteps = [8, 9, 10, 11, 12, 13, 14];
  const tgrSteps = [7, 6, 5, 4, 3, 2, 1];

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-3xl font-light text-text-primary">AI Deal <span className="font-bold">Engine</span></h2>
          <p className="text-text-muted text-sm italic">Standalone DCF Valuation & Multi-Scenario Sensitivity</p>
        </div>
        <div className="flex gap-8">
          <div className="text-right">
            <p className="text-[10px] text-text-muted uppercase tracking-wider">Base Price</p>
            <p className="text-xl font-mono text-accent-blue">{t.currency}{fmt(computeDCF(state.dcf.base)?.price || 0, 2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-text-muted uppercase tracking-wider">Market Price</p>
            <p className="text-xl font-mono text-text-primary">{t.currency}{fmt(t.currentPrice, 2)}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {results.map((res: any, i) => (
          <div key={i} className="bg-bg-card border border-border-alt rounded-xl p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4">
              <span className="text-[9px] bg-accent-blue/10 text-accent-blue border border-accent-blue/30 px-2 py-0.5 rounded font-bold">{res.n.toUpperCase()}</span>
            </div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-accent-blue mb-4">{res.n} Result</h3>
            {res.error ? (
              <div className="text-accent-red font-mono text-[10px] bg-accent-red/10 p-4 rounded border border-accent-red/20">WACC ≤ TGR ERROR: MODEL VOID</div>
            ) : (
              <>
                <div className="text-[32px] font-mono font-bold leading-none mb-3 text-text-primary tracking-tighter">
                  {t.currency}{fmt(res.price, 2)}
                </div>
                <div className="flex items-center gap-2 mb-4">
                   <span className={cn(
                     "px-2 py-0.5 rounded text-[10px] font-bold border",
                     res.price > t.currentPrice 
                      ? "bg-accent-green/10 text-accent-green border-accent-green/20" 
                      : "bg-accent-red/10 text-accent-red border-accent-red/20"
                   )}>
                     {fmtP((res.price / t.currentPrice - 1) * 100, 1)} Premium
                   </span>
                </div>
                <div className="space-y-1.5 border-t border-border-alt pt-4 mt-2">
                   <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-text-muted">Enterprise Value</span>
                      <span className="text-text-primary">{t.currency}{fmt(res.EV)} Mn</span>
                   </div>
                   <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-text-muted">Terminal Value %</span>
                      <span className="text-text-primary">{fmt(res.tvPct, 1)}%</span>
                   </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-4 lg:col-span-12 space-y-4">
          <div className="bg-bg-card border border-border-alt rounded-xl p-5">
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-6 flex items-center gap-2">
              <Settings size={14} className="text-accent-blue" />
              Model Parameters
            </div>
            
            <div className="space-y-6">
               <Slider label="Scenario: Bear CAGR" value={state.dcf.bear} min={2} max={15} step={0.5} onChange={v => updateSection("dcf", { bear: v })} />
               <Slider label="Scenario: Base CAGR" value={state.dcf.base} min={2} max={25} step={0.5} onChange={v => updateSection("dcf", { base: v })} />
               <Slider label="Scenario: Bull CAGR" value={state.dcf.bull} min={5} max={35} step={0.5} onChange={v => updateSection("dcf", { bull: v })} />
               <div className="h-px bg-border-alt my-2" />
               <Slider label="Target EBIT Margin" value={state.dcf.ebitM} min={3} max={45} step={0.5} onChange={v => updateSection("dcf", { ebitM: v })} unit="%" />
               <Slider label="Discount Rate (WACC)" value={state.dcf.wacc} min={5} max={20} step={0.25} onChange={v => updateSection("dcf", { wacc: v })} unit="%" />
               <Slider label="Term. Growth Rate" value={state.dcf.tgr} min={1} max={8} step={0.25} onChange={v => updateSection("dcf", { tgr: v })} unit="%" />
            </div>
          </div>
        </div>

        <div className="xl:col-span-8 lg:col-span-12 space-y-6">
          <div className="bg-bg-card border border-border-alt rounded-xl p-5 overflow-hidden">
             <div className="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                <Grid3X3 size={14} className="text-accent-blue" />
                Sensitivity Matrix
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-center font-mono text-[10px] border-collapse">
                   <thead>
                      <tr>
                         <th className="p-2 text-text-muted border-b border-r border-border-alt text-right bg-bg-alt/30">TGR↓ / WACC→</th>
                         {waccSteps.map(w => <th key={w} className="p-3 border-b border-border-alt bg-bg-alt/50 font-bold text-text-primary">{w}%</th>)}
                      </tr>
                   </thead>
                   <tbody>
                      {tgrSteps.map(tgrVal => (
                        <tr key={tgrVal}>
                           <td className="p-3 text-text-muted border-r border-border-alt bg-bg-alt/50 text-right font-bold">{tgrVal}%</td>
                           {waccSteps.map(wVal => {
                             if (wVal <= tgrVal) return <td key={wVal} className="p-3 text-text-muted/20 bg-bg opacity-50">–</td>;
                             const resVal = computeDCF_static(state.dcf.base, { ...state.dcf, wacc: wVal, tgr: tgrVal }, t);
                             const price = resVal?.price || 0;
                             const ratio = price / t.currentPrice;
                             
                             let colorClass = "";
                             if (ratio > 1.2) colorClass = "bg-accent-green/20 text-accent-green";
                             else if (ratio > 1.0) colorClass = "bg-accent-green/5 text-accent-green/70";
                             else if (ratio > 0.8) colorClass = "bg-accent-red/5 text-accent-red/70";
                             else colorClass = "bg-accent-red/20 text-accent-red";

                             return (
                               <td key={wVal} className={cn("p-3 border border-border-alt/20 transition-all font-bold", colorClass)}>
                                 {t.currency}{fmt(price, 0)}
                               </td>
                             );
                           })}
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
             <div className="mt-4 flex gap-6 items-center border-t border-border-alt pt-4">
                <div className="flex gap-2 items-center text-[10px] font-mono text-text-muted uppercase tracking-tighter">
                    <div className="w-2 h-2 rounded-full bg-accent-green" /> Prem vs {t.currency}{fmt(t.currentPrice, 0)}
                </div>
                <div className="flex gap-2 items-center text-[10px] font-mono text-text-muted uppercase tracking-tighter">
                    <div className="w-2 h-2 rounded-full bg-accent-red" /> Discount
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, unit = "%" }: any) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-[11px] font-mono">
        <span className="text-text-secondary font-medium tracking-tight uppercase opacity-70">{label}</span>
        <span className="text-accent-blue font-bold">{value}{unit}</span>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step} 
        value={value} 
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-border-alt rounded-lg appearance-none cursor-pointer accent-accent-blue"
      />
    </div>
  );
}

function CompRow({ label, mult, price, marketPrice, cur }: any) {
  const diff = (price / marketPrice - 1) * 100;
  return (
    <tr className="border-b border-border/10">
      <td className="py-2.5 font-medium">{label}</td>
      <td className="py-2.5 text-right font-mono text-text-muted">{fmtX(mult)}</td>
      <td className="py-2.5 text-right text-accent-blue font-bold font-mono">{cur}{fmt(price, 2)}</td>
      <td className={cn("py-2.5 text-right font-bold", diff >= 0 ? "text-accent-green" : "text-accent-red")}>
        {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
      </td>
    </tr>
  );
}

// Static helper for cell calc
function computeDCF_static(growth: number, dcf: any, t: any) {
    const wacc = dcf.wacc / 100;
    const tgr = dcf.tgr / 100;
    if (wacc <= tgr) return null;
    const tax = 0.25; // Default tax
    const daP = 0.05; // Default DA
    const cxP = 0.05; // Default CapEx
    const eM = dcf.ebitM / 100;
    
    let rev = t.revenue;
    let sumPV = 0;
    for (let y = 1; y <= 5; y++) {
      rev *= (1 + growth / 100);
      const ebit = rev * eM;
      const fcf = ebit * (1 - tax) + (rev * daP) - (rev * cxP);
      sumPV += fcf / Math.pow(1 + wacc, y);
      if (y === 5) {
        const terminalValue = (fcf * (1 + tgr)) / (wacc - tgr);
        sumPV += terminalValue / Math.pow(1 + wacc, y);
      }
    }
    const EV = sumPV;
    const equityVal = EV - t.netDebt;
    return { price: equityVal / t.sharesOutstanding, EV };
}
