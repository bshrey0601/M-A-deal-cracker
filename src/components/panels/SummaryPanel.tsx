import React, { useState, useMemo, useRef } from "react";
import { useDeal } from "../../context/DealContext";
import { cn, fmt, fmtP, fmtX } from "../../lib/utils";
import { Trophy, Zap, AlertTriangle, Loader2, Info, BookOpen, Search, Calculator, Download, FileType } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export function SummaryPanel() {
  const { state, updateSection } = useDeal();
  const [aiLoading, setAiLoading] = useState(false);
  const [thesisHtml, setThesisHtml] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

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
              desc="Enter tickers in 'Fetch & Verify'. AI will pull financials directly." 
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

  const exportToPDF = async () => {
    if (!reportRef.current || !thesisHtml) return;
    
    setAiLoading(true);
    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#0a0a0c", // Match our dark theme
      });
      
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      // Add margin
      const margin = 10;
      pdf.addImage(imgData, "PNG", margin, margin, pdfWidth - 2 * margin, pdfHeight - 2 * margin);
      pdf.save(`Deal_Mandate_${state.target?.ticker}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error("PDF Export error:", err);
    } finally {
      setAiLoading(false);
    }
  };

  const generateThesis = async () => {
    setAiLoading(true);
    setThesisHtml(null);

    const prompt = `Act as a Senior Managing Director in Goldman Sachs Global M&A Group. Your task is to produce a "Boutique-Grade" Board of Directors Investment Mandate. 
    The output must be strictly structured using professional HTML tags (<h3>, <h4>, <ul>, <li>, <strong>). 
    Avoid all conversational filler ("Certainly", "Here is your report"). Start immediately with the title.
    
    DEAL CORE DATA:
    - Acquirer: ${state.acquirer?.name}
    - Target: ${state.target?.name}
    - Consideration: ${state.deal.cashPct}% Cash / ${state.deal.stockPct}% Equity
    - Offer Price: ${state.target?.currency}${state.deal.offer} (Premium: ${fmtP((state.deal.offer / state.target!.currentPrice - 1) * 100)})
    - Implied EV: ${state.target?.currency}${fmt(state.deal.offer * state.target!.sharesOutstanding + state.target!.netDebt)}M
    - WACC/Hurdle Rate: ${state.wacc.toFixed(2)}%
    
    REQUIRED STRUCTURE:
    1. EXECUTUIVE SUMMARY: A high-level overview of the strategic logic and total value potential.
    2. STRATEGIC RATIONALE: Focus on competitive moat enhancement, market share consolidation, and technical synergies.
    3. SYNERGIES EXECUTION MATRIX: Detail cost synergies (Ops/IT/HC) and revenue synergies (Cross-sell/GEO).
    4. VALUATION COMPASS: Analyze the transaction multiples vs industry benchmarks and DCF-implied value.
    5. INTEGRATION RISK ARCHITECTURE: Identify the top 3 mission-critical risks and mitigation strategies.
    6. FINAL MD RECOMMENDATION: A binary decision with a conviction level and immediate next steps.
    
    STYLING GUIDELINE: Use <h3> for primary sections and <h4> for sub-sections. Use <strong> for emphasis on financial figures.`;

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
                onClick={exportToPDF}
                disabled={aiLoading}
                className="px-4 py-2 border border-border-alt text-text-secondary font-bold text-[10px] uppercase tracking-[2px] rounded flex items-center gap-2 hover:bg-bg-alt transition-all disabled:opacity-50"
               >
                 <FileType size={12} /> Export PDF
               </button>
             )}
             <button 
              disabled={aiLoading}
              onClick={generateThesis}
              className="px-6 py-2 bg-accent-blue text-white font-black text-[10px] uppercase tracking-[3px] rounded flex items-center gap-3 hover:brightness-110 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(37,99,235,0.25)] active:scale-[0.98]"
             >
               {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
               {thesisHtml ? "Regenerate Mandate" : "Generate Mandate"}
             </button>
           </div>
        </div>

        {thesisHtml ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-700" ref={reportRef}>
             {/* Printable Header for PDF */}
             <div className="hidden pdf-only mb-10 border-b border-border-alt pb-8">
               <h1 className="text-2xl font-bold uppercase tracking-widest">Confidential M&A Mandate</h1>
               <div className="grid grid-cols-2 gap-4 mt-4 text-xs font-mono opacity-60">
                 <p>SUBJECT: ${state.target?.name} [${state.target?.ticker}]</p>
                 <p>ACQUIRER: ${state.acquirer?.name} [${state.acquirer?.ticker}]</p>
                 <p>DATE: ${new Date().toLocaleDateString()}</p>
                 <p>CLASSIFICATION: BOARD-LEVEL HIGH CONFIDENTIAL</p>
               </div>
             </div>

            <div 
              className="prose prose-invert prose-sm max-w-none 
              prose-headings:font-bold prose-headings:uppercase prose-headings:tracking-widest prose-headings:text-accent-blue
              prose-h3:text-[14px] prose-h3:mt-10 prose-h3:mb-6 prose-h3:border-b prose-h3:border-accent-blue/20 prose-h3:pb-2
              prose-h4:text-[11px] prose-h4:text-text-muted prose-h4:mb-3 prose-h4:mt-8
              prose-p:text-text-secondary prose-p:leading-relaxed prose-p:mb-5
              prose-li:text-text-secondary prose-li:mb-2 prose-ul:mb-8
              prose-strong:text-text-primary prose-strong:font-bold
              bg-bg/40 p-12 rounded-xl border border-border-alt shadow-inner"
              dangerouslySetInnerHTML={{ __html: thesisHtml }} 
            />
            
            {/* Printable Footer for PDF */}
            <div className="hidden pdf-only mt-10 text-[8px] font-mono opacity-40 text-center uppercase tracking-widest leading-loose">
              Synthesized by Groq AI M&A Terminal · Goldman Sachs Global Strategy Core · Unauthorized duplication is strictly prohibited
            </div>
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

        <div className="mt-8 pt-8 border-t border-border-alt/50 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center no-print">
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
              <span className="text-[9px] font-mono text-text-muted uppercase tracking-tighter">This narrative is generated via Groq AI logic. High fidelity synthesis.</span>
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
