import React from "react";
import { Settings, Zap } from "lucide-react";

export function Topbar() {
  return (
    <header className="sticky top-0 z-[200] h-16 border-b border-border-alt flex items-center justify-between px-6 bg-bg-alt pointer-events-auto">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-accent-blue rounded flex items-center justify-center">
          <span className="font-black text-[10px] text-white">M&A</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight uppercase">
          Deal Cracker <span className="text-text-muted font-normal normal-case text-sm tracking-normal">v2.4</span>
        </h1>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-bg border border-border-alt rounded-md text-xs">
          <div className="w-2 h-2 bg-accent-orange rounded-full animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
          <span className="text-text-secondary font-mono uppercase">GROQ-AI-ACTIVE</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-border border border-border-alt" />
      </div>
    </header>
  );
}

function Badge({ label, color }: { label: string, color: string }) {
  const colorMap: Record<string, string> = {
    "accent-green": "bg-accent-green/10 text-accent-green border-accent-green/30",
    "accent-purple": "bg-accent-purple/10 text-accent-purple border-accent-purple/30",
    "accent-orange": "bg-accent-orange/10 text-accent-orange border-accent-orange/30",
    "accent-cyan": "bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30"
  };
  
  return (
    <span className={`px-2 py-0.5 rounded border text-[9px] font-mono font-bold tracking-wider ${colorMap[color]}`}>
      {label}
    </span>
  );
}
