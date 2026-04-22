import React, { useState, useMemo } from "react";
import { useDeal } from "../../context/DealContext";
import { DAMO_BETAS, COUNTRY_DATA } from "../../constants";
import { cn, fmt } from "../../lib/utils";
import { Calculator, Info, CheckCircle2, Zap } from "lucide-react";

export function WaccPanel() {
  const { state, updateSection } = useDeal();
  const [sector, setSector] = useState(Object.keys(DAMO_BETAS)[0]);
  const [country, setCountry] = useState(Object.keys(COUNTRY_DATA)[0]);
  
  const [inputs, setInputs] = useState({
    dlev: 20,
    cod: 8.5,
    size: 2.0,
    specific: 1.0,
    rfr: 7.15,
    erp: 4.60,
    crp: 2.15,
    tax: 25
  });

  const waccRes = useMemo(() => {
    const s = DAMO_BETAS[sector];
    const c = COUNTRY_DATA[country];
    
    // Auto-update rfr/crp based on country
    const finalRFR = c.rfr || 4.25;
    const finalCRP = c.crp || 0;
    
    const unlevBeta = s.beta;
    const dlev = inputs.dlev / 100;
    const de = dlev / (1 - dlev);
    const tax = inputs.tax / 100;
    
    const levBeta = unlevBeta * (1 + (1 - tax) * de);
    const totalERP = inputs.erp + finalCRP;
    const costEquity = finalRFR + levBeta * totalERP + inputs.size + inputs.specific;
    const atCOD = inputs.cod * (1 - tax);
    const wacc = (costEquity * (1 - dlev)) + (atCOD * dlev);
    
    return { wacc, costEquity, atCOD, levBeta, unlevBeta, totalERP, eLev: 1-dlev, dLev: dlev };
  }, [sector, country, inputs]);

  const handleApply = () => {
    updateSection("wacc", +waccRes.wacc.toFixed(2));
    updateSection("waccCalibrated", true);
    updateSection("dcf", { ...state.dcf, wacc: +waccRes.wacc.toFixed(2) });
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-3xl font-light text-text-primary">WACC <span className="font-bold">Calibration</span></h2>
          <p className="text-text-muted text-sm italic">Damodaran Model · Jan 2024 NYU Stern Metrics</p>
        </div>
      </header>

      <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-xl p-4 flex gap-3 items-start text-accent-blue text-[11px] leading-relaxed">
        <Info size={16} className="shrink-0 mt-0.5" />
        <p>This calculator determines the Weighted Average Cost of Capital (WACC) using Aswath Damodaran's latest published risk parameters. It dynamically adjusts for international geography, sector-specific risk, and capital structure leverage.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card title="Step 01: Market Parameters">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">Target Sector</label>
                <select 
                  value={sector}
                  onChange={e => setSector(e.target.value)}
                  className="w-full bg-bg border border-border-alt rounded-md px-3 py-2 font-mono text-[11px] text-text-primary outline-none focus:border-zinc-500"
                >
                  {Object.entries(DAMO_BETAS).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">Geography</label>
                <select 
                   value={country}
                   onChange={e => setCountry(e.target.value)}
                   className="w-full bg-bg border border-border-alt rounded-md px-3 py-2 font-mono text-[11px] text-text-primary outline-none focus:border-zinc-500"
                >
                  {Object.entries(COUNTRY_DATA).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Card title="Step 02: Capital Structure">
             <div className="grid grid-cols-2 gap-4">
                <Input label="D / (D+E) %" value={inputs.dlev} onChange={v => setInputs(p => ({...p, dlev:v}))} />
                <Input label="Pre-tax CoD %" value={inputs.cod} onChange={v => setInputs(p => ({...p, cod:v}))} />
             </div>
             <div className="h-px bg-border-alt my-4 opacity-50" />
             <div className="grid grid-cols-2 gap-4">
                <Input label="Size Premium %" value={inputs.size} onChange={v => setInputs(p => ({...p, size:v}))} />
                <Input label="Risk Alpha %" value={inputs.specific} onChange={v => setInputs(p => ({...p, specific:v}))} />
             </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Step 03: Risk Primitives">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Risk-Free Rate %" value={inputs.rfr} onChange={v => setInputs(p => ({...p, rfr:v}))} />
              <Input label="Equity Risk Premium %" value={inputs.erp} onChange={v => setInputs(p => ({...p, erp:v}))} />
            </div>
            <div className="h-px bg-border-alt my-4 opacity-50" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Country Risk %" value={inputs.crp} onChange={v => setInputs(p => ({...p, crp:v}))} />
              <Input label="Marginal Tax %" value={inputs.tax} onChange={v => setInputs(p => ({...p, tax:v}))} />
            </div>
          </Card>

          <div className="bg-bg-card border border-border-alt rounded-2xl p-10 flex flex-col items-center justify-center relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4">
              <span className="text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-2 py-0.5 rounded font-bold uppercase tracking-tighter">Goldman Scale</span>
            </div>
            <p className="text-[10px] font-mono text-text-muted uppercase tracking-[4px] mb-4">Calculated WACC</p>
            <div className="text-[64px] font-mono font-bold text-text-primary tracking-tighter leading-none">{waccRes.wacc.toFixed(2)}%</div>
            <div className="mt-4 flex gap-6 text-[10px] font-mono text-text-muted uppercase tracking-widest">
              <span className="text-accent-blue font-bold">Ke: {waccRes.costEquity.toFixed(2)}%</span>
              <span className="opacity-10 text-zinc-800">|</span>
              <span>Kd: {waccRes.atCOD.toFixed(2)}%</span>
            </div>
            
            <button 
              onClick={handleApply}
              className="mt-8 w-full py-4 bg-accent-blue text-white font-black text-xs uppercase tracking-[2px] rounded-lg shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={16} />
              Update DCF Sensitivity
            </button>
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
        <div className="w-1.5 h-1.5 rounded-full bg-accent-blue" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Input({ label, value, onChange }: any) {
  return (
    <div className="space-y-2 flex-1">
      <label className="text-[9px] font-mono text-text-muted uppercase tracking-wider block opacity-70">{label}</label>
      <input 
        type="number"
        value={value}
        onChange={e => onChange?.(parseFloat(e.target.value) || 0)}
        step="0.1"
        className="w-full bg-bg border border-border-alt rounded-md px-3 py-2 font-mono text-[12px] text-text-primary outline-none focus:border-zinc-500 transition-all"
      />
    </div>
  );
}
