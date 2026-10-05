import { CompanyData } from "../types";

async function readError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

/** Live quote and reported fundamentals from Yahoo Finance via the server. */
export async function fetchCompanyData(ticker: string): Promise<CompanyData> {
  const sym = ticker.trim().toUpperCase();
  const response = await fetch(`/api/market/${encodeURIComponent(sym)}`);
  if (!response.ok) {
    throw new Error(await readError(response, `Cannot fetch "${sym}" (HTTP ${response.status}).`));
  }
  return response.json();
}

/**
 * Fallback: asks an LLM to estimate the company's financials. These figures are
 * NOT verified and can be wrong; the result is labelled unverified in the UI.
 */
export async function fetchCompanyEstimate(ticker: string): Promise<CompanyData> {
  const sym = ticker.trim().toUpperCase();
  
  try {
    const response = await fetch("/api/ai/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: sym }),
    });

    if (!response.ok) {
      throw new Error(await readError(response, "Extraction failed"));
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
      description: result.description || `${sym} · ${result.sector}`,
      source: {
        provider: "AI estimate (Groq, llama-3.1-8b)",
        verified: false,
        asOf: new Date().toISOString(),
        warnings: ["Figures are an AI estimate, not reported data. Verify against filings before relying on them."],
      },
    };
  } catch (e: any) {
    console.error(`Groq estimate error for ${sym}:`, e);
    throw new Error(`AI estimate for "${sym}" failed: ${e.message}`);
  }
}
