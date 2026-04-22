import React, { useMemo } from "react";
import { useDeal } from "../../context/DealContext";
import { cn, fmt, fmtP } from "../../lib/utils";
import { 
  Plus, 
  Check, 
  BarChart2, 
  FileText, 
  Calculator, 
  Search, 
  Zap, 
  ShieldCheck, 
  Receipt,
  Layers,
  LayoutDashboard,
  Trophy,
  History
} from "lucide-react";

interface SidebarProps {
  activePanel: string;
  setActivePanel: (panel: string) => void;
}

export function Sidebar({ activePanel, setActivePanel }: SidebarProps) {
  const { state } = useDeal();

  const navItems = [
    { id: "fetch", label: "Fetch & Verify", icon: Search },
    { id: "wacc", label: "Financial Modeling", icon: Calculator },
    { id: "precedents", label: "Market Cross-Check", icon: History },
    { id: "dcf", label: "AI Deal Engine", icon: BarChart2 },
    { id: "summary", label: "Thesis & Review", icon: Trophy },
  ];

  const health = useMemo(() => {
    let score = 20;
    if (state.target) score += 15;
    if (state.waccCalibrated) score += 10;
    if (state.precedentsBenchmarked) score += 15;
    if (state.proformaCalculated) score += 15;
    if (state.ppaApplied) score += 10;
    if (state.thesisGenerated) score += 15;
    return Math.min(score, 100);
  }, [state]);

  return (
    <aside className="w-60 border-r border-border-alt bg-bg-alt p-4 flex flex-col gap-1 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto shrink-0 select-none">
      <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest px-3 mb-2">Active Entities</div>
      {state.target ? (
        <div className="space-y-1 mb-6">
           <CompanyCard company={state.target} active />
           {state.acquirer && <CompanyCard company={state.acquirer} />}
        </div>
      ) : (
        <div className="px-3 py-4 bg-bg rounded-md border border-border-alt mb-6 text-[10px] font-mono text-text-muted italic">
          No deal data loaded
        </div>
      )}

      <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest px-3 mb-2">Deal Modules</div>
      {navItems.map(item => (
        <button 
          key={item.id}
          onClick={() => setActivePanel(item.id)}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all text-left",
            activePanel === item.id 
              ? "bg-accent-blue/10 text-accent-blue border border-accent-blue/20" 
              : "text-text-secondary hover:bg-border/50 hover:text-text-primary"
          )}
        >
          <item.icon size={14} className="shrink-0" />
          {item.label}
        </button>
      ))}

      <div className="mt-auto pt-6 border-t border-border-alt">
        <div className="px-3 pb-2 flex justify-between items-center text-[10px] font-mono uppercase tracking-widest text-text-muted">
           <span>Model Health</span>
           <span className={cn("font-bold transition-colors", health === 100 ? "text-accent-green" : "text-accent-blue")}>
            {health}%
           </span>
        </div>
        <div className="h-1 bg-border rounded-full overflow-hidden mx-3">
          <div 
            className="h-full bg-accent-blue transition-all duration-1000" 
            style={{ width: `${health}%` }}
          />
        </div>
      </div>
    </aside>
  );
}

function CompanyCard({ company, active }: { company: any, active?: boolean }) {
  return (
    <div className={cn(
      "px-3 py-2 rounded-md border transition-all cursor-default",
      active ? "bg-accent-blue/10 border-accent-blue/20 text-accent-blue" : "border-border-alt bg-bg"
    )}>
      <div className="text-[10px] uppercase font-bold tracking-tighter opacity-50 mb-0.5">{company.ticker}</div>
      <div className={cn("text-xs font-semibold truncate", active ? "text-accent-blue" : "text-text-primary")}>{company.name}</div>
    </div>
  );
}

function NavItem({ active, onClick, icon: Icon, label, badge, badgeType }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 p-2 rounded-md font-medium text-[12px] w-full text-left transition-all mb-0.5 border border-transparent",
        active ? "bg-accent-green/10 border-accent-green/20 text-accent-green" : "text-text-secondary hover:bg-bg-card hover:text-text-primary"
      )}
    >
      <Icon size={14} className="shrink-0" />
      <span className="truncate">{label}</span>
      {badge && (
        <span className={cn(
          "ml-auto text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border leading-none",
          badgeType === "done" && "bg-accent-green/10 text-accent-green border-accent-green/20",
          badgeType === "new" && "bg-accent-orange/10 text-accent-orange border-accent-orange/30",
          badgeType === "ppa" && "bg-accent-purple/10 text-accent-purple border-accent-purple/30",
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}

function CompanySummary({ company, label, color }: { company: any, label: string, color: string }) {
  return (
    <div className="bg-bg-card border border-border-alt rounded p-2 text-left" style={{ borderColor: `${color}26` }}>
      <div className="text-[8px] font-mono uppercase tracking-wider mb-1" style={{ color }}>{label}</div>
      <div className="text-[12px] font-semibold truncate leading-tight">{company.name}</div>
      <div className="text-[9px] font-mono text-text-muted truncate">{company.ticker} · {company.sector}</div>
      <div className="text-[14px] font-mono font-semibold mt-1" style={{ color }}>{company.currency}{fmt(company.currentPrice, 2)}</div>
    </div>
  );
}
