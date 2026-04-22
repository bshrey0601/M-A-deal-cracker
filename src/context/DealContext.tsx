import React, { createContext, useContext, useState, ReactNode } from "react";
import { DealState, CompanyData } from "../types";

const initialState: DealState = {
  target: null,
  acquirer: null,
  wacc: 10,
  waccCalibrated: false,
  cfVerified: { t: false, a: false },
  ppaApplied: false,
  ppaAnnualAmort: 0,
  precedentsBenchmarked: false,
  proformaCalculated: false,
  thesisGenerated: false,
  deal: { offer: 0, cashPct: 60, stockPct: 40, fees: 1.5, finRate: 6 },
  dcf: { bear: 6, base: 10, bull: 16, ebitM: 12, wacc: 10, tgr: 4, daPct: 5, cxPct: 5, tax: 25 },
  syn: {
    cSell: 0, geo: 0, prc: 0, bnd: 0, rR: 60,
    hc: 0, proc: 0, fac: 0, it: 0, cR: 75,
    sev: 0, itI: 0, leg: 0
  },
  selectedPrecedents: []
};

interface DealContextType {
  state: DealState;
  setState: React.Dispatch<React.SetStateAction<DealState>>;
  updateSection: <T extends keyof DealState>(section: T, data: Partial<DealState[T]>) => void;
  resetState: () => void;
}

const DealContext = createContext<DealContextType | undefined>(undefined);

export function DealProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DealState>(initialState);

  const updateSection = <T extends keyof DealState>(section: T, data: Partial<DealState[T]>) => {
    setState(prev => ({
      ...prev,
      [section]: typeof data === 'object' && !Array.isArray(data) 
        ? { ...prev[section], ...data } 
        : data
    }));
  };

  const resetState = () => setState(initialState);

  return (
    <DealContext.Provider value={{ state, setState, updateSection, resetState }}>
      {children}
    </DealContext.Provider>
  );
}

export function useDeal() {
  const context = useContext(DealContext);
  if (!context) throw new Error("useDeal must be used within a DealProvider");
  return context;
}
