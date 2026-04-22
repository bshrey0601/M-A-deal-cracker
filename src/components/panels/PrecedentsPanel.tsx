import React, { useState, useMemo } from "react";
import { useDeal } from "../../context/DealContext";
import { PRECEDENTS } from "../../constants";
import { cn, fmt, fmtP, fmtX } from "../../lib/utils";
import { History, Search, CheckCircle2, TrendingUp, Filter } from "lucide-react";

export function PrecedentsPanel() {
  const { state, setState } = useDeal();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filteredPrecedents = useMemo(() => {
    return PRECEDENTS.filter(d => {
      const matchesFilter = filter === "all" || d.sector === filter || 
        (filter === "india" && d.deal.includes("(India"));
      const matchesSearch = d.deal.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [filter, search]);

  const togglePrecedent = (idx: number) => {
    setState(prev => {
      const selected = [...prev.selectedPrecedents];
      const pos = selected.indexOf(idx);
      if (pos >= 0) selected.splice(pos, 1);
      else selected.push(idx);
      
      return {
        ...prev,
        selectedPrecedents: selected,
        precedentsBenchmarked: selected.length > 0
      };
    });
  };

  const selectedDeals = state.selectedPrecedents.map(i => PRECEDENTS[i]);
  const stats = useMemo(() => {
    if (selectedDeals.length === 0) return null;
    
    const evEvs = selectedDeals.map(d => d.evEv).filter(v => v !== null) as number[];
    const prems = selectedDeals.map(d => d.prem).filter(v => v !== null) as number[];
    const evRevs = selectedDeals.map(d => d.evRev).filter(v => v !== null) as number[];
    
    const median = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const s = [...arr].sort((a,b) => a-b);
      const m = Math.floor(s.length/2);
      return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
    };

    return {
      evEvRange: evEvs.length ? `${fmtX(Math.min(...evEvs))} – ${fmtX(Math.max(...evEvs))}` : "–",
      evEvMed: median(evEvs),
      premRange: prems.length ? `${fmt(Math.min(...prems))}% – ${fmt(Math.max(...prems))}%` : "–",
      premMed: median(prems),
      evRevRange: evRevs.length ? `${fmtX(Math.min(...evRevs))} – ${fmtX(Math.max(...evRevs))}` : "–",
      evRevMed: median(evRevs),
      count: selectedDeals.length
    };
  }, [selectedDeals]);

  const filters = [
    { id: "all", label: "All Sectors" },
    { id: "tech", label: "Tech" },
    { id: "telecom", label: "Telecom" },
    { id: "energy", label: "Energy" },
    { id: "retail", label: "Retail" },
    { id: "pharma", label: "Pharma" },
    { id: "finance", label: "Finance" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-3xl font-light text-text-primary">Market <span className="font-bold">Benchmarking</span></h2>
          <p className="text-text-muted text-sm italic">Precedent Transaction Database · 2018–2024 Actuals</p>
        </div>
      </header>

      <div className="bg-bg-card border border-border-alt rounded-2xl p-6 relative overflow-hidden">
        <h3 className="text-[10px] font-bold uppercase tracking-[4px] text-accent-blue mb-6">Database Environment</h3>
        <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.map(f => (
              <button 
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "px-4 py-2 rounded text-[10px] uppercase font-black tracking-widest border transition-all",
                  filter === f.id 
                    ? "bg-accent-blue text-white border-accent-blue shadow-[0_0_15px_rgba(37,99,235,0.3)]" 
                    : "bg-bg border-border-alt text-text-muted hover:border-zinc-600 hover:text-text-secondary"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted opacity-50" />
             <input 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter deals..." 
              className="w-full bg-bg border border-border-alt rounded-md pl-9 pr-3 py-2 font-mono text-[11px] text-text-primary outline-none focus:border-accent-blue transition-all"
             />
          </div>
        </div>
      </div>

      <div className="bg-bg-card border border-border-alt rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border-alt flex justify-between items-center bg-bg-alt/30">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
              <History size={14} className="text-accent-blue" />
              Verified Transaction logs
            </span>
            <span className="text-[9px] font-mono text-text-muted uppercase opacity-50">{filteredPrecedents.length} Datasets</span>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left font-mono text-[11px] border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="text-text-muted text-[9px] uppercase tracking-wider bg-bg-alt border-b border-border-alt">
                <th className="p-4 font-bold">Target / Acquirer</th>
                <th className="p-4 font-bold text-right">Year</th>
                <th className="p-4 font-bold text-right">EV ($Bn)</th>
                <th className="p-4 font-bold text-right">EV/EBITDA</th>
                <th className="p-4 font-bold text-right">EV/Rev</th>
                <th className="p-4 font-bold text-right">Premium</th>
                <th className="p-4 font-bold text-center">Outcome</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              {filteredPrecedents.map((deal) => {
                const globalIdx = PRECEDENTS.indexOf(deal);
                const isSelected = state.selectedPrecedents.includes(globalIdx);
                
                return (
                  <tr 
                    key={globalIdx}
                    onClick={() => togglePrecedent(globalIdx)}
                    className={cn(
                      "border-b border-border-alt last:border-0 cursor-pointer transition-all group",
                      isSelected ? "bg-accent-blue/10" : "hover:bg-bg-alt"
                    )}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                         <div className={cn(
                           "w-4 h-4 rounded border flex items-center justify-center transition-all",
                           isSelected ? "bg-accent-blue border-accent-blue shadow-[0_0_8px_rgba(37,99,235,0.4)]" : "border-border shadow-inner"
                         )}>
                           {isSelected && <CheckCircle2 size={10} className="text-white" />}
                         </div>
                         <div className="flex flex-col">
                           <span className={cn("text-[12px] font-bold group-hover:text-text-primary transition-colors", isSelected && "text-accent-blue")}>{deal.deal}</span>
                           <span className="text-[9px] text-text-muted opacity-50 uppercase">{deal.sector}</span>
                         </div>
                      </div>
                    </td>
                    <td className="p-4 text-right opacity-50">{deal.yr}</td>
                    <td className="p-4 text-right text-text-primary font-bold">{deal.val}</td>
                    <td className="p-4 text-right text-accent-blue font-bold">{deal.evEv ? fmtX(deal.evEv) : "—"}</td>
                    <td className="p-4 text-right opacity-70">{deal.evRev ? fmtX(deal.evRev) : "—"}</td>
                    <td className={cn(
                      "p-4 text-right font-bold",
                      deal.prem ? (deal.prem > 30 ? "text-accent-green" : deal.prem < 0 ? "text-accent-red" : "text-text-primary") : ""
                    )}>
                      {deal.prem !== null ? fmtP(deal.prem, 0) : "—"}
                    </td>
                    <td className="p-4 text-center">
                       <span className={cn(
                         "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-tighter",
                         deal.type === "Distressed" ? "bg-accent-red/10 text-accent-red border border-accent-red/20" : 
                         deal.type === "Merger" ? "bg-accent-blue/10 text-accent-blue border border-accent-blue/20" : 
                         "bg-accent-green/10 text-accent-green border border-accent-green/20"
                       )}>
                         {deal.type}
                       </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
           <div className="bg-bg-card border border-border-alt rounded-xl p-6">
              <div className="text-[10px] font-bold text-text-muted uppercase tracking-[3px] mb-6 flex items-center gap-2">
                <TrendingUp size={14} className="text-accent-blue" />
                Benchmark Aggregation ({stats.count} Deals)
              </div>
              <div className="grid grid-cols-3 gap-4">
                 <KpiCard label="EV/EBITDA Matrix" val={stats.evEvRange} sub={`Median: ${fmtX(stats.evEvMed)}`} />
                 <KpiCard label="Premium Mandate" val={stats.premRange} sub={`Median: ${fmt(stats.premMed)}%`} />
                 <KpiCard label="EV/Revenue Band" val={stats.evRevRange} sub={`Median: ${fmtX(stats.evRevMed)}`} />
              </div>
           </div>
           
           <div className="bg-bg-card border border-border-alt rounded-xl p-6">
              <div className="text-[10px] font-bold text-text-muted uppercase tracking-[3px] mb-6">Target vs Market Discrepancy</div>
              <div className="space-y-4">
                 <CompareRow label="Implied Deal Multiple" val={fmtX(state.target ? (state.deal.offer * state.target.sharesOutstanding + state.target.netDebt) / state.target.ebitda : 0)} active />
                 <CompareRow label="Precedent Median Log" val={fmtX(stats.evEvMed)} />
                 <div className="h-px bg-border-alt my-2" />
                 <CompareRow label="Scenario Offer Premium" val={fmtP(state.target ? (state.deal.offer / state.target.currentPrice - 1) * 100 : 0)} active />
                 <CompareRow label="Benchmark Median Premium" val={fmtP(stats.premMed)} />
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, val, sub }: any) {
  return (
    <div className="bg-bg border border-border-alt rounded-lg p-4 transition-all hover:border-zinc-600">
      <div className="text-[8px] font-mono text-text-muted uppercase tracking-wider mb-2 opacity-60">{label}</div>
      <div className="text-[15px] font-mono font-bold text-text-primary leading-tight mb-2">{val}</div>
      <div className="text-[9px] font-mono text-accent-blue font-bold uppercase tracking-tighter">{sub}</div>
    </div>
  );
}

function CompareRow({ label, val, active }: any) {
  return (
    <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-tight">
       <span className="text-text-muted">{label}</span>
       <span className={cn(active ? "text-accent-blue font-black underline underline-offset-4" : "text-text-primary font-bold opacity-50")}>{val}</span>
    </div>
  );
}
