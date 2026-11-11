import { CompanyData } from "../types";
import { apiUrl, readApiError, BACKEND_MISSING } from "../lib/api";
import { reviveCompany } from "../lib/revive";

/** Thrown when filings loaded but no live price source answered; the user can type the price in. */
export class NeedsPriceError extends Error {
  constructor(public ticker: string, message: string) {
    super(message);
  }
}

/**
 * Reported financials (SEC filings for US companies) plus a live price, via the server.
 * `manualPrice` is a share price the user entered when no live price source was reachable.
 */
export async function fetchCompanyData(ticker: string, manualPrice?: number): Promise<CompanyData> {
  const sym = ticker.trim().toUpperCase();
  const query = manualPrice ? `?price=${encodeURIComponent(String(manualPrice))}` : "";
  let response: Response;
  try {
    response = await fetch(apiUrl(`/api/market/${encodeURIComponent(sym)}${query}`));
  } catch {
    throw new Error(BACKEND_MISSING);
  }
  if (!response.ok) {
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const body = isJson ? await response.json().catch(() => null) : null;
    if (!isJson) throw new Error(BACKEND_MISSING);
    const message = body?.error || `Cannot fetch "${sym}" (HTTP ${response.status}).`;
    if (body?.needsPrice) throw new NeedsPriceError(sym, message);
    throw new Error(message);
  }
  return reviveCompany(await response.json());
}

/**
 * Fallback: asks an LLM to estimate the company's financials. These figures are
 * NOT verified and can be wrong; the result is labelled unverified in the UI.
 */
export async function fetchCompanyEstimate(ticker: string): Promise<CompanyData> {
  const sym = ticker.trim().toUpperCase();
  
  try {
    const response = await fetch(apiUrl("/api/ai/extract"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: sym }),
    });

    if (!response.ok) {
      throw new Error(await readApiError(response, "Extraction failed"));
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
        provider: `AI estimate (${result.aiProvider || "AI"})`,
        verified: false,
        asOf: new Date().toISOString(),
        warnings: ["Figures are an AI estimate, not reported data. Verify against filings before relying on them."],
      },
    };
  } catch (e: any) {
    console.error(`AI estimate error for ${sym}:`, e);
    throw new Error(`AI estimate for "${sym}" failed: ${e.message}`);
  }
}
