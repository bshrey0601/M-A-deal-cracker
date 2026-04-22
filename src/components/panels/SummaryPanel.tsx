import React, { useState, useMemo } from "react";
import { useDeal } from "../../context/DealContext";
import { cn, fmt, fmtP, fmtX } from "../../lib/utils";
import { Trophy, Zap, AlertTriangle, Loader2, Info, BookOpen, Search, Calculator, Download, Share2 } from "lucide-react";

export function SummaryPanel() {
  const { state, updateSection } = useDeal();
  const [aiLoading, setAiLoading] = useState(false);
  const [thesisHtml, setThesisHtml] = useState<string | null>(null);

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

  if (!state.target || !state.acquirer) {
    return (
      <div className="space-y-8 max-w-4xl">
        <div className="p-10 bg-accent-blue/5 border border-accent-blue/20 rounded-2xl">
          <div className="flex items-center gap-4 mb-6">
             <div className="w-12 h-12 bg-accent-blue/20 rounded-xl flex items-center justify-center text-accent-blue">
               <BookOpen size={24} />
             </div>
             <div>
               <h3 className="text-xl font-bold text-text-primary tracking-tight">Deal Cracker Operational Guide</h3>
               <p className="text-text-muted text-xs font-mono uppercase tracking-widest mt-1">Status: Configuration Incomplete</p>
             </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GuideStep 
              num="01" 
              icon={Search} 
              title="Extraction" 
              desc="Enter tickers in 'Fetch & Verify'. Gemini AI will pull financials directly." 
              active={!state.target}
            />
            <GuideStep 
              num="02" 
              icon={Calculator} 
              title="Calibration" 
              desc="Set deal terms and WACC. Ensure premiums are within market benchmarks." 
              active={!!state.target && !state.waccCalibrated}
            />
            <GuideStep 
              num="03" 
              icon={Zap} 
              title="Synthesis" 
              desc="Generate this final mandate once the model health reaches 70% or more." 
              active={!!state.target && !!state.acquirer}
            />
          </div>
        </div>
        
        <div className="p-6 bg-accent-blue/10 border border-border-alt rounded-xl text-text-muted font-mono text-[10px] leading-relaxed uppercase tracking-widest text-center italic">
          Mandate Engine Locked // Awaiting Subject & Predicate Entities
        </div>
      </div>
    );
  }

  const exportThesis = () => {
    if (!thesisHtml) return;
    const blob = new Blob([thesisHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `M&A_Thesis_${state.target?.ticker}_${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateThesis = async () => {
    setAiLoading(true);
    setThesisHtml(null);

    const prompt = `You are a Senior Managing Director at Goldman Sachs M&A Group. Write an exhaustive, board-level M&A mandate and investment thesis. 
    The tone must be authoritative, objective, and highly sophisticated. Use bullet points and professional headers.
    
    DEAL ARCHITECTURE:
    - Acquirer: ${state.acquirer?.name}
    - Target: ${state.target?.name}
    - Transaction Style: ${state.deal.cashPct}% Cash / ${state.deal.stockPct}% Equity
    - Implied Premium: ${fmtP((state.deal.offer / state.target!.currentPrice - 1) * 100)}
    - Pro-Forma Synergies: ${state.target?.currency}${state.syn.hc + state.syn.proc + state.syn.fac + state.syn.it} Mn (Cost) / ${state.syn.cSell + state.syn.geo + state.syn.prc + state.syn.bnd} Mn (Revenue)
    - WACC Constraint: ${state.wacc.toFixed(2)}%
    
    EXHAUSTIVE SECTIONS REQUIRED (HTML format <h3>, <h4>, <ul>, <li>):
    1. Executive Summary & Strategic Rationale (Why this deal makes sense now)
    2. Market Positioning & Competitive Moat Enhancement
    3. Synergies Deep-Dive & Execution Plan
    4. Financial Accretion/Dilution Analysis & Valuation Benchmark
    5. Risk Architecture (Regulatory, Integration, Macro)
    6. MD Recommendation & Next Operational Steps
    
    Produce a long-form, comprehensive report that would be presented to a Board of Directors.`;

    try {
      const response = await fetch("/api/ai/thesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        setThesisHtml(`<p class='text-accent-red text-xs font-mono'>Critical Error: Server returned non-JSON data. Check logs.</p>`);
        return;
      }
      
      if (!response.ok) {
        setThesisHtml(`<p class='text-accent-red text-xs font-mono'>Engine Error: ${data.error || response.statusText}</p>`);
        return;
      }

      const thesisContent = data.choices?.[0]?.message?.content || "Failed to engage Mandate Engine.";
      setThesisHtml(thesisContent);
      updateSection("thesisGenerated", true as any);
    } catch (err) {
      console.error("Thesis AI error:", err);
      setThesisHtml("<p class='text-accent-red text-xs font-mono'>Network Error: Failed to communicate with the Mandate Engine proxy.</p>");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-3xl font-light text-text-primary">M&A <span className="font-bold">Thesis</span></h2>
          <p className="text-text-muted text-sm italic">Strategic Review & Mandate Evaluation Matrix</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
         <StatsCard label="Control Prem" val={fmtP((state.deal.offer / state.target.currentPrice - 1) * 100)} sub="vs market" />
         <StatsCard label="Enterprise Val" val={`${state.target.currency}${fmt(state.deal.offer * state.target.sharesOutstanding + state.target.netDebt)}M`} sub="Transaction Scale" />
         <StatsCard label="EV/EBITDA Paid" val={fmtX((state.deal.offer * state.target.sharesOutstanding + state.target.netDebt) / state.target.ebitda)} sub="Implied Ratio" />
         <StatsCard label="Total Synergies" val={`${state.target.currency}${fmt(state.syn.cSell + state.syn.geo + state.syn.prc + state.syn.bnd + state.syn.hc + state.syn.proc + state.syn.fac + state.syn.it)}M`} sub="Fully Realized" accent="accent-green" />
         <StatsCard label="Confidence Score" val={`${health}%`} sub="Data Integrity" active />
      </div>

      <section className="bg-bg-card border border-border-alt rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4">
          <span className="text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-2 py-0.5 rounded font-bold uppercase tracking-widest leading-none">Deal Intelligence</span>
        </div>
        
        <div className="flex items-center justify-between mb-8">
           <h3 className="text-xs font-bold uppercase tracking-[4px] text-accent-blue flex items-center gap-2">
             <Trophy size={14} /> MD Narrative Logic
           </h3>
           <div className="flex items-center gap-3">
             {thesisHtml && (
               <button 
                onClick={exportThesis}
                className="px-4 py-2 border border-border-alt text-text-secondary font-bold text-[10px] uppercase tracking-[2px] rounded flex items-center gap-2 hover:bg-bg-alt transition-all"
               >
                 <Download size={12} /> Export Mandate
               </button>
             )}
             <button 
              disabled={aiLoading}
              onClick={generateThesis}
              className="px-6 py-2 bg-accent-blue text-white font-black text-[10px] uppercase tracking-[3px] rounded flex items-center gap-3 hover:brightness-110 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(37,99,235,0.25)] active:scale-[0.98]"
             >
               {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
               {thesisHtml ? "Regenerate Thesis" : "Generate Mandate"}
             </button>
           </div>
        </div>

        {thesisHtml ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
            <div 
              className="prose prose-invert prose-sm max-w-none 
              prose-headings:font-bold prose-headings:uppercase prose-headings:tracking-widest prose-headings:text-accent-blue
              prose-h3:text-[13px] prose-h4:text-[11px] prose-h4:text-text-muted prose-h4:mb-2 prose-h4:mt-6
              prose-p:text-text-secondary prose-p:leading-relaxed prose-p:mb-4
              prose-li:text-text-secondary prose-li:mb-2 prose-ul:mb-6
              bg-bg/40 p-10 rounded-xl border border-border-alt shadow-inner"
              dangerouslySetInnerHTML={{ __html: thesisHtml }} 
            />
          </div>
        ) : (
          <div className="py-24 border border-dashed border-border-alt rounded-xl flex flex-col items-center justify-center space-y-6 bg-bg/20">
             <div className="w-16 h-16 bg-accent-blue/10 rounded-full flex items-center justify-center">
                <Zap size={32} className="text-accent-blue opacity-40 shrink-0" />
             </div>
             <div className="text-center space-y-2">
               <p className="text-[11px] font-mono text-text-muted uppercase tracking-[3px] leading-relaxed max-w-xs mx-auto">
                 {aiLoading ? "Executing MD-Level Analysis..." : "Awaiting Strategic Synthesis Request"}
               </p>
               {aiLoading && <div className="w-48 h-1 bg-border-alt rounded-full mx-auto overflow-hidden mt-4"><div className="h-full bg-accent-blue animate-shimmer" style={{ width: '40%' }} /></div>}
             </div>
          </div>
        )}

        <div className="mt-8 pt-8 border-t border-border-alt/50 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
           <div className="flex gap-8">
             <div className="space-y-1">
               <p className="text-[8px] text-text-muted uppercase tracking-widest font-mono">Premium Status</p>
               <p className={cn("text-xs font-bold uppercase", (state.target.currentPrice ? (state.deal.offer/state.target.currentPrice-1) : 0) > 0.3 ? "text-accent-orange" : "text-accent-green")}>
                 {(state.target.currentPrice ? (state.deal.offer/state.target.currentPrice-1) : 0) > 0.3 ? "Aggressive Premium" : "Fair Market Range"}
               </p>
             </div>
             <div className="space-y-1">
               <p className="text-[8px] text-text-muted uppercase tracking-widest font-mono">Model Integrity</p>
               <p className="text-xs font-bold uppercase text-text-primary">
                 {state.waccCalibrated ? "Calibrated via Damodaran" : "Standard Assumptions"}
               </p>
             </div>
           </div>
           
           <div className="bg-bg border border-border-alt rounded px-4 py-2 flex items-center gap-3">
              <Info size={14} className="text-accent-blue" />
              <span className="text-[9px] font-mono text-text-muted uppercase tracking-tighter">This narrative is generated via Groq/XAI logic. High fidelity synthesis.</span>
           </div>
        </div>
      </section>
    </div>
  );
}

function StatsCard({ label, val, sub, accent, active }: any) {
  return (
    <div className={cn(
      "bg-bg-card border border-border-alt rounded-lg p-4 text-center transition-all hover:bg-bg-alt/50",
      active && "border-accent-blue/30 bg-accent-blue/5"
    )}>
       <div className="text-[8px] font-mono text-text-muted uppercase mb-2 tracking-widest opacity-60">{label}</div>
       <div className={cn("text-[16px] font-mono font-bold leading-none mb-1 text-text-primary", accent === "accent-green" && "text-accent-green")}>{val}</div>
       <div className="text-[9px] font-mono text-text-muted opacity-40 uppercase tracking-tighter">{sub}</div>
    </div>
  );
}

function GuideStep({ num, title, desc, icon: Icon, active }: any) {
  return (
    <div className={cn(
      "p-5 rounded-xl border transition-all",
      active ? "bg-accent-blue/10 border-accent-blue/30 text-text-primary" : "bg-bg border-border-alt grayscale opacity-40"
    )}>
       <div className="flex justify-between items-start mb-4">
         <Icon size={18} className={active ? "text-accent-blue" : "text-text-muted"} />
         <span className="text-[10px] font-mono font-bold text-text-muted">{num}</span>
       </div>
       <h4 className="text-[12px] font-bold uppercase tracking-wider mb-2">{title}</h4>
       <p className="text-[11px] leading-relaxed text-text-secondary">{desc}</p>
    </div>
  );
}
