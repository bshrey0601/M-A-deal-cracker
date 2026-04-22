import { CompanyData } from "../types";

export async function fetchCompanyData(ticker: string): Promise<CompanyData> {
  const sym = ticker.trim().toUpperCase();
  
  try {
    const response = await fetch("/api/ai/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: sym }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Extraction failed");
    }

    const result = await response.json();

    return {
      name: result.name || sym,
      ticker: sym,
      sector: result.sector || 'General',
      currency: result.currency || '$',
      unit: 'Mn',
      currentPrice: result.currentPrice || 0,
      fiftyTwoWeekHigh: result.fiftyTwoWeekHigh || result.currentPrice * 1.2,
      fiftyTwoWeekLow: result.fiftyTwoWeekLow || result.currentPrice * 0.8,
      sharesOutstanding: result.sharesOutstanding || 1,
      marketCap: result.marketCap || 0,
      revenue: result.revenue || 0,
      ebitda: result.ebitda || 0,
      ebit: result.ebit || 0,
      netIncome: result.netIncome || 0,
      eps: result.eps || 0,
      da: result.da || 0,
      capex: result.capex || 0,
      netDebt: result.netDebt || 0,
      bookValuePerShare: result.bookValuePerShare || 0,
      dividendPerShare: result.dividendPerShare || 0,
      peRatio: result.trailingPE || 0,
      evEbitda: result.enterpriseToEbitda || 0,
      evRevenue: result.enterpriseToRevenue || 0,
      pbRatio: result.pbRatio || 0,
      revenueGrowthYoY: (result.revenueGrowth || 0) * 100,
      ebitdaMargin: (result.ebitdaMargin || 0) * 100,
      netMargin: (result.netMargin || 0) * 100,
      fiscalYear: result.fiscalYear || 'FY' + (new Date().getFullYear() - 1),
      exchange: result.exchange || 'NASDAQ',
      description: result.description || `${sym} · ${result.sector}`
    };
  } catch (e: any) {
    console.error(`Groq Fetch error for ${sym}:`, e);
    throw new Error(`Cannot fetch "${sym}": Groq extraction failed. please verify your GROQ_API_KEY.`);
  }
}
