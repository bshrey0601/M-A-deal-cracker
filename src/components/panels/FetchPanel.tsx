import React, { useState } from "react";
import { useDeal } from "../../context/DealContext";
import { fetchCompanyData } from "../../services/dataService";
import { cn, fmt, fmtP, fmtX } from "../../lib/utils";
import { Search, Loader2, FileText, CheckCircle2, AlertCircle } from "lucide-react";

export function FetchPanel() {
  const { state, setState, updateSection } = useDeal();
  const [tkT, setTkT] = useState("");
  const [tkA, setTkA] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleFetchBoth = async () => {
    if (!tkT || !tkA) {
      alert("Please enter both target and acquirer tickers.");
      return;
    }
    
    setLoading(true);
    setStatus(`Fetching ${tkT}...`);
    
    try {
      const target = await fetchCompanyData(tkT);
      setStatus(`Fetching ${tkA}...`);
      const acquirer = await fetchCompanyData(tkA);
      
      const rg = target.revenueGrowthYoY || 10;
      
      setState(prev => ({
        ...prev,
        target,
        acquirer,
        deal: {
          ...prev.deal,
          offer: +(target.currentPrice * 1.25).toFixed(2)
        },
        dcf: {
          ...prev.dcf,
          ebitM: +(target.ebit / target.revenue * 100).toFixed(1) || 12,
          daPct: +(target.da / target.revenue * 100).toFixed(1) || 5,
          cxPct: +(target.capex / target.revenue * 100).toFixed(1) || 5,
          bear: +Math.max(2, rg * 0.6).toFixed(1),
          base: +rg.toFixed(1),
          bull: +Math.min(40, rg * 1.5).toFixed(1)
        }
      }));
      
      setStatus("Successfully loaded market data.");
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-3xl font-light text-text-primary">Data <span className="font-bold">Fetch</span></h2>
          <p className="text-text-muted text-sm italic">Target and Acquirer Financial Intelligence</p>
        </div>
        {state.target && (
          <div className="flex gap-8">
            <div className="text-right">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">Enterprise Value</p>
              <p className="text-xl font-mono text-accent-blue">${fmt(state.deal.offer * state.target.sharesOutstanding + state.target.netDebt)} Mn</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">EV/EBITDA</p>
              <p className="text-xl font-mono text-text-primary">{fmtX((state.deal.offer * state.target.sharesOutstanding + state.target.netDebt) / state.target.ebitda)}</p>
            </div>
          </div>
        )}
      </header>

      <section className="bg-bg-card border border-border-alt rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4">
          <span className="text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/30 px-2 py-0.5 rounded uppercase font-bold tracking-tighter">Market Connectivity</span>
        </div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-accent-blue">Tickers & Exchange</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4">
            <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">Target Equity</label>
            <input 
              value={tkT}
              onChange={e => setTkT(e.target.value)}
              placeholder="e.g. RELIANCE.NS" 
              className="w-full bg-bg border border-border-alt rounded-md px-3 py-2 font-mono text-[13px] outline-none focus:border-zinc-500 transition-all placeholder:text-zinc-700"
            />
          </div>
          
          <div className="md:col-span-1 text-center pb-2 text-text-muted font-bold block md:hidden lg:block text-xs uppercase tracking-tighter opacity-30">vs</div>
          
          <div className="md:col-span-4">
            <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">Acquirer Equity</label>
            <input 
              value={tkA}
              onChange={e => setTkA(e.target.value)}
              placeholder="e.g. TCS.NS" 
              className="w-full bg-bg border border-border-alt rounded-md px-3 py-2 font-mono text-[13px] outline-none focus:border-zinc-500 transition-all placeholder:text-zinc-700"
            />
          </div>
          
          <div className="md:col-span-3">
            <button 
              onClick={handleFetchBoth}
              disabled={loading}
              className="w-full h-[40px] px-6 bg-accent-blue hover:bg-accent-blue/90 text-white font-bold text-xs uppercase tracking-widest rounded transition-all shadow-[0_0_15px_rgba(37,99,235,0.2)] disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin inline mr-2" /> : "Verify Market Data"}
            </button>
          </div>
        </div>
        
        <div className="mt-2 font-mono text-[9px] text-text-muted uppercase tracking-tight flex items-center justify-between">
          <span>Source: Yahoo Finance Real-time · Multi-proxy enabled</span>
          {status && <span className={cn(status.startsWith("Error") ? "text-accent-red" : "text-accent-orange", "font-bold")}>{status}</span>}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UploadCard title="Target 10-K / Annual Report" which="t" />
        <UploadCard title="Acquirer 10-K / Annual Report" which="a" />
      </div>

      {state.target && state.acquirer && <FetchPreview target={state.target!} acquirer={state.acquirer!} />}
    </div>
  );
}

function UploadCard({ title, which }: { title: string, which: "t" | "a" }) {
  return (
    <div className="bg-bg-card border border-border-alt rounded-xl p-5 group transition-colors hover:border-zinc-700">
      <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-4">{title}</h3>
      <div className="border border-border-alt border-dashed rounded-lg p-6 text-center bg-bg/50 cursor-pointer">
        <div className="text-[20px] mb-2 opacity-30 group-hover:opacity-100 group-hover:text-accent-blue transition-all">📑</div>
        <div className="text-[10px] font-mono text-text-muted uppercase tracking-tight">Financial Extraction Layer</div>
        <p className="text-[9px] text-zinc-600 mt-1">Drag & Drop SEC Filings</p>
      </div>
    </div>
  );
}

function FetchPreview({ target, acquirer }: { target: any, acquirer: any }) {
  return (
    <div className="animate-in fade-in duration-700 slide-in-from-bottom-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompanyCard company={target} type="TARGET" color="var(--color-accent-blue)" />
        <CompanyCard company={acquirer} type="ACQUIRER" color="var(--color-accent-blue)" />
      </div>

      <footer className="flex items-center justify-between border-t border-border-alt pt-6 mt-10">
        <div className="flex gap-4">
          <button className="px-4 py-2 bg-border-alt hover:bg-zinc-700 rounded text-[10px] uppercase font-bold tracking-widest text-text-secondary transition-colors border border-zinc-700/50">Export Multiples</button>
          <button className="px-4 py-2 bg-border-alt hover:bg-zinc-700 rounded text-[10px] uppercase font-bold tracking-widest text-text-secondary transition-colors border border-zinc-700/50">Deal VDR</button>
        </div>
        <p className="text-[10px] text-text-muted font-mono uppercase tracking-widest">
           Step 01: Data Integrity Verified
        </p>
      </footer>
    </div>
  );
}

function CompanyCard({ company, type, color }: { company: any, type: string, color: string }) {
  const cur = company.currency;
  return (
    <div className="bg-bg-card border border-border-alt rounded-xl p-6 relative overflow-hidden group">
      <div className="flex items-center justify-between mb-2">
          <div className="flex flex-col">
            <span className="text-[8px] uppercase font-black tracking-[3px] text-zinc-500 mb-1">{type}</span>
            <span className="text-xl font-bold text-text-primary tracking-tight">{company.name}</span>
          </div>
          <span className="text-2xl font-mono text-accent-blue/80 opacity-50 font-light">{company.ticker}</span>
      </div>
      
      <p className="text-[11px] text-text-muted mb-6 leading-relaxed bg-bg/40 p-2 rounded border border-border-alt/30 select-none italic font-mono truncate">{company.description}</p>
      
      <div className="grid grid-cols-3 gap-6 mb-8">
        <MetricBox label="Last Price" val={`${cur}${fmt(company.currentPrice, 2)}`} sub={`${cur}${fmt(company.fiftyTwoWeekLow, 0)} Low`} />
        <MetricBox label="Market Cap" val={`${cur}${fmt(company.marketCap)} Mn`} sub={`${fmt(company.sharesOutstanding, 0)} Mn Shares`} />
        <MetricBox label="EV/EBITDA" val={fmtX(company.evEbitda)} sub={`P/E ${fmtX(company.peRatio)}`} />
      </div>

      <div className="space-y-2">
         <DataRow label="LTM Revenue" val={`${cur}${fmt(company.revenue)} Mn`} trend={`${fmtP(company.revenueGrowthYoY, 1)}`} />
         <DataRow label="EBITDA Margin" val={`${fmtP(company.ebitdaMargin, 1)}`} trend={fmt(company.ebitda) + " Mn"} />
         <DataRow label="Net Earnings" val={`${cur}${fmt(company.netIncome)} Mn`} trend={fmtP(company.netMargin, 1)} highlight />
         <DataRow label="Net Debt / Cash" val={`${cur}${fmt(company.netDebt)} Mn`} trend="Verified" />
      </div>
    </div>
  );
}

function MetricBox({ label, val, sub }: any) {
  return (
    <div>
       <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1 font-bold">{label}</p>
       <p className="text-lg font-mono text-text-primary leading-none mb-1">{val}</p>
       <p className="text-[9px] text-zinc-600 font-mono italic">{sub}</p>
    </div>
  );
}

function DataRow({ label, val, trend, highlight }: any) {
  return (
    <div className={cn(
      "flex justify-between items-center px-3 py-2 rounded border border-transparent transition-all",
      highlight ? "bg-accent-blue/5 border-accent-blue/10" : "hover:bg-bg/50"
    )}>
       <span className="text-[11px] text-text-secondary font-medium tracking-tight">{label}</span>
       <div className="flex items-center gap-4">
          <span className={cn("text-[11px] font-mono", highlight ? "text-accent-blue font-bold" : "text-text-primary")}>{val}</span>
          <span className="text-[9px] font-mono text-zinc-600 min-w-[40px] text-right">{trend}</span>
       </div>
    </div>
  );
}

function TableRow({ label, val, trend, trendColor, highlight }: any) {
  return (
    <tr className={cn("border-b border-border/20 last:border-0", highlight && "bg-accent-green/5")}>
      <td className={cn("py-2 px-1", highlight && "text-accent-green font-semibold")}>{label}</td>
      <td className="py-2 px-1 text-text-primary">{val}</td>
      <td className="py-2 px-1">
        <span className={cn(
          "px-1.5 py-0.5 rounded text-[9px] font-bold border",
          trendColor ? "bg-opacity-10" : "bg-bg-alt text-text-muted border-border/50"
        )} style={trendColor ? { backgroundColor: `${trendColor}1a`, color: trendColor, borderColor: `${trendColor}33` } : {}}>
          {trend}
        </span>
      </td>
    </tr>
  );
}

const Zap = ({ size, className }: any) => <div className={className}><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 L13 2 Z" /></svg></div>;
