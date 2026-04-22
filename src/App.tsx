import React, { useState } from "react";
import { DealProvider } from "./context/DealContext";
import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { FetchPanel } from "./components/panels/FetchPanel";
import { WaccPanel } from "./components/panels/WaccPanel";
import { DCFPanel } from "./components/panels/DCFPanel";
import { PrecedentsPanel } from "./components/panels/PrecedentsPanel";
import { SummaryPanel } from "./components/panels/SummaryPanel";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [activePanel, setActivePanel] = useState("fetch");
  const [showModal, setShowModal] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem("de_xai_key") || "");

  // Expose modal to window for Topbar button
  (window as any).showApiKeyModal = () => setShowModal(true);

  const saveKey = (val: string) => {
    localStorage.setItem("de_xai_key", val);
    setApiKey(val);
    setShowModal(false);
  };

  const renderPanel = () => {
    switch (activePanel) {
      case "fetch": return <FetchPanel />;
      case "wacc": return <WaccPanel />;
      case "precedents": return <PrecedentsPanel />;
      case "dcf": return <DCFPanel />;
      case "summary": return <SummaryPanel />;
      default: return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-text-muted">
          <div className="text-[40px] mb-4">📐</div>
          <h2 className="text-[14px] font-mono uppercase tracking-[2px] font-bold">Module Under Construction</h2>
          <p className="text-[11px] mt-2 max-w-xs text-center">Core modules (Fetch, WACC, Precedents, DCF, Summary) are live. Accretion & PPA logic available in AI Thesis.</p>
        </div>
      );
    }
  };

  return (
    <DealProvider>
      <div className="min-h-screen bg-bg font-sans text-text-primary selection:bg-accent-green selection:text-bg relative">
        <Topbar />
        
        <div className="flex min-h-[calc(100vh-50px)]">
          <Sidebar activePanel={activePanel} setActivePanel={setActivePanel} />
          
          <main className="flex-1 p-6 md:p-8 overflow-x-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activePanel}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {renderPanel()}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* API Key Modal */}
        <AnimatePresence>
          {showModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-bg/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-bg-card border border-border-alt rounded-2xl p-8 max-w-md w-full shadow-2xl"
              >
                <h3 className="text-lg font-bold text-[#e0ecff] mb-2">⚙️ X AI (Grok) API Settings</h3>
                <p className="text-[11px] font-mono text-text-muted mb-6 leading-relaxed">
                  The app uses a default key for demonstration. You can override it here. Key is stored locally in your browser.
                </p>
                <input 
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="xai-..."
                  className="w-full bg-bg-alt border border-border-alt rounded-lg px-4 py-3 text-sm font-mono outline-none focus:border-accent-green transition-all mb-6"
                />
                <div className="flex gap-3">
                  <button 
                    onClick={() => saveKey(apiKey)}
                    className="flex-1 py-3 bg-accent-green text-bg font-bold rounded-lg hover:brightness-110 transition-all font-sans text-sm"
                  >
                    SAVE CHANGES
                  </button>
                  <button 
                    onClick={() => setShowModal(false)}
                    className="px-6 py-3 bg-bg-alt text-text-secondary font-bold rounded-lg hover:text-text-primary transition-all font-sans text-sm border border-border-alt"
                  >
                    CANCEL
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DealProvider>
  );
}
