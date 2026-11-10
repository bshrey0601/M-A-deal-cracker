import React, { useState, useMemo, useEffect } from "react";
import { apiUrl } from "../../lib/api";
import { MarketInputs, Sourced } from "../../lib/marketInputs";
import { useDeal } from "../../context/DealContext";
import { DAMO_BETAS, COUNTRY_DATA } from "../../constants";
import { cn, fmt } from "../../lib/utils";
import { Calculator, Info, CheckCircle2, Zap, ExternalLink } from "lucide-react";

type InputKey = "rfr" | "erp" | "crp" | "beta";
const BUILT_IN = "Built-in default (not live)";

export function WaccPanel() {
  const { state, updateSection } = useDeal();
  const [live, setLive] = useState<MarketInputs | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [sector, setSector] = useState(Object.keys(DAMO_BETAS)[0]);
  const [country, setCountry] = useState("usa");
  // Inputs the user typed over; they keep the user's value and are labelled as edited.
  const [edited, setEdited] = useState<Set<InputKey>>(new Set());

  const [inputs, setInputs] = useState({
    dlev: 20,
    cod: 8.5,
    size: 2.0,
    specific: 1.0,
    rfr: COUNTRY_DATA.usa.rfr,
    erp: COUNTRY_DATA.usa.erp,
    crp: 0,
    tax: 25
  });
  const edit = (k: keyof typeof inputs, v: number) => {
    setInputs(p => ({ ...p, [k]: v }));
    if (k === "rfr" || k === "erp" || k === "crp") setEdited(e => new Set(e).add(k));
  };

  // Live inputs: 10-year Treasury, Damodaran ERP, country risk premiums and industry betas.
  useEffect(() => {
    fetch(apiUrl("/api/market-inputs"))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((m: MarketInputs) => {
        setLive(m);
        if (m.betas?.value.length) setSector(m.betas.value.find(b => /software/i.test(b.industry))?.industry ?? m.betas.value[0].industry);
        if (m.countries?.value.length) setCountry(m.countries.value.find(c => /^united states/i.test(c.country))?.country ?? m.countries.value[0].country);
        setInputs(p => ({
          ...p,
          rfr: m.riskFree?.value ?? p.rfr,
          erp: m.erp?.value ?? p.erp,
        }));
        if (m.errors.length) setLiveError(m.errors.join(" · "));
      })
      .catch(e => setLiveError(`Live inputs unavailable (${e.message}); using built-in defaults.`));
  }, []);

  const liveBetas = live?.betas?.value;
  const liveCountries = live?.countries?.value;
  const sectorOptions = liveBetas
    ? liveBetas.map(b => ({ key: b.industry, label: `${b.industry} (β ${b.unleveredBeta.toFixed(2)})`, beta: b.unleveredBeta }))
    : Object.entries(DAMO_BETAS).map(([key, v]) => ({ key, label: v.label, beta: v.beta }));
  const countryOptions = liveCountries
    ? liveCountries.map(c => ({ key: c.country, label: c.country, crp: c.crp }))
    : Object.entries(COUNTRY_DATA).map(([key, v]) => ({ key, label: v.label, crp: v.crp }));
  const beta = sectorOptions.find(o => o.key === sector)?.beta ?? sectorOptions[0].beta;

  // Selecting a country sets its country risk premium (unless the user typed their own).
  useEffect(() => {
    if (edited.has("crp")) return;
    const c = countryOptions.find(o => o.key === country);
    if (c) setInputs(p => ({ ...p, crp: c.crp }));
    // Built-in data also carries a local risk-free rate; live data is in USD terms (US Treasury + CRP).
    if (!liveCountries && !edited.has("rfr") && COUNTRY_DATA[country]) setInputs(p => ({ ...p, rfr: COUNTRY_DATA[country].rfr }));
  }, [country, liveCountries]);

  const provenance: Record<InputKey, Sourced<unknown> | undefined> = {
    rfr: live?.riskFree,
    erp: live?.erp,
    crp: live?.countries,
    beta: live?.betas,
  };

  const waccRes = useMemo(() => {
    const finalRFR = inputs.rfr;
    const finalCRP = inputs.crp;

    const unlevBeta = beta;
    const dlev = inputs.dlev / 100;
    const de = dlev / (1 - dlev);
    const tax = inputs.tax / 100;
    
    const levBeta = unlevBeta * (1 + (1 - tax) * de);
    const totalERP = inputs.erp + finalCRP;
    const costEquity = finalRFR + levBeta * totalERP + inputs.size + inputs.specific;
    const atCOD = inputs.cod * (1 - tax);
    const wacc = (costEquity * (1 - dlev)) + (atCOD * dlev);
    
    return { wacc, costEquity, atCOD, levBeta, unlevBeta, totalERP, eLev: 1-dlev, dLev: dlev };
  }, [beta, inputs]);

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
          <p className="text-text-muted text-sm italic">CAPM build-up · {live?.betas || live?.erp ? "live U.S. Treasury and Damodaran (NYU Stern) data" : "built-in defaults"}</p>
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
                  {sectorOptions.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
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
                  {countryOptions.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Card title="Step 02: Capital Structure">
             <div className="grid grid-cols-2 gap-4">
                <Input label="D / (D+E) %" value={inputs.dlev} onChange={v => edit("dlev", v)} />
                <Input label="Pre-tax CoD %" value={inputs.cod} onChange={v => edit("cod", v)} />
             </div>
             <div className="h-px bg-border-alt my-4 opacity-50" />
             <div className="grid grid-cols-2 gap-4">
                <Input label="Size Premium %" value={inputs.size} onChange={v => edit("size", v)} />
                <Input label="Risk Alpha %" value={inputs.specific} onChange={v => edit("specific", v)} />
             </div>
          </Card>
        </div>

        <div className="space-y-6">
          <SourcesCard provenance={provenance} edited={edited} error={liveError} values={{ rfr: inputs.rfr, erp: inputs.erp, crp: inputs.crp, beta }} />

          <Card title="Step 03: Risk Primitives">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Risk-Free Rate %" value={inputs.rfr} onChange={v => edit("rfr", v)} />
              <Input label="Equity Risk Premium %" value={inputs.erp} onChange={v => edit("erp", v)} />
            </div>
            <div className="h-px bg-border-alt my-4 opacity-50" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Country Risk %" value={inputs.crp} onChange={v => edit("crp", v)} />
              <Input label="Marginal Tax %" value={inputs.tax} onChange={v => edit("tax", v)} />
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

const LABELS: Record<InputKey, string> = {
  rfr: "Risk-free rate (10-year US Treasury)",
  erp: "Equity risk premium (mature market)",
  crp: "Country risk premium",
  beta: "Unlevered industry beta",
};

/** Where each cost-of-capital input comes from, with its date and a link to the source. */
function SourcesCard({ provenance, edited, error, values }: {
  provenance: Record<InputKey, Sourced<unknown> | undefined>;
  edited: Set<InputKey>;
  error: string | null;
  values: Record<InputKey, number>;
}) {
  return (
    <Card title="Input sources">
      <ul className="space-y-2 text-[11px]">
        {(Object.keys(LABELS) as InputKey[]).map(k => {
          const p = provenance[k];
          return (
            <li key={k} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-text-secondary">{LABELS[k]}: <span className="font-mono text-text-primary">{k === "beta" ? values[k].toFixed(2) : `${values[k].toFixed(2)}%`}</span></span>
              <span className={cn("text-[10px]", edited.has(k) ? "text-accent-orange" : p ? "text-accent-green" : "text-text-muted")}>
                {edited.has(k) ? "Edited by you" : p ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                    {p.source} · {p.asOf} <ExternalLink size={9} />
                  </a>
                ) : BUILT_IN}
              </span>
            </li>
          );
        })}
      </ul>
      {provenance.crp && !edited.has("rfr") && (
        <p className="mt-3 text-[10px] text-text-muted">Live inputs are in US dollar terms: US Treasury rate plus the country's risk premium (Damodaran's method). For a local-currency WACC, enter the local government bond yield.</p>
      )}
      {error && <p className="mt-3 text-[10px] text-accent-orange">{error}</p>}
    </Card>
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
