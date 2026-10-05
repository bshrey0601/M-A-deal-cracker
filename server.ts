import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import YahooFinance from "yahoo-finance2";
import { mapYahooToCompany } from "./src/lib/marketData";

dotenv.config();

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Tickers like AAPL, BRK-B, RELIANCE.NS, 0700.HK, ^GSPC. Also keeps user input out of LLM prompts.
const TICKER_RE = /^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$/;
const cleanTicker = (v: unknown) => {
  const t = String(v ?? "").trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
};

const SUMMARY_MODULES = ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"] as const;

/** Rate converting 1 unit of `from` into `to`, handling London's pence quotes (GBp). */
async function fxRate(from: string, to: string): Promise<number> {
  const norm = (c: string) => (c === "GBp" ? "GBP" : c);
  const scale = (to === "GBp" ? 100 : 1) / (from === "GBp" ? 100 : 1);
  if (norm(from) === norm(to)) return scale;
  const q: any = await yahoo.quote(`${norm(from)}${norm(to)}=X`, {}, { validateResult: false });
  const rate = q?.regularMarketPrice;
  if (typeof rate !== "number" || !(rate > 0)) throw new Error(`No FX rate for ${from}->${to}`);
  return rate * scale;
}

const isProduction = process.env.NODE_ENV === "production" || process.argv.includes("--production");

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const groqKey = () => process.env.GROQ_API_KEY?.trim();

  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", marketData: "yahoo-finance", aiConfigured: Boolean(groqKey()) });
  });

  // Live market data + fundamentals from Yahoo Finance (no API key needed).
  app.get("/api/market/:ticker", async (req, res) => {
    const ticker = cleanTicker(req.params.ticker);
    if (!ticker) return res.status(400).json({ error: "Invalid ticker symbol." });

    try {
      const summary: any = await yahoo.quoteSummary(ticker, { modules: [...SUMMARY_MODULES] }, { validateResult: false });
      if (!summary?.price?.regularMarketPrice) {
        return res.status(404).json({ error: `No market data found for "${ticker}". Check the symbol (e.g. RELIANCE.NS for NSE, 7203.T for Tokyo).` });
      }

      const period1 = new Date();
      period1.setUTCFullYear(period1.getUTCFullYear() - 3);
      let annual: any[] = [];
      try {
        annual = await yahoo.fundamentalsTimeSeries(ticker, { period1, type: "annual", module: "all" }, { validateResult: false });
      } catch (e) {
        console.warn(`fundamentalsTimeSeries failed for ${ticker}:`, (e as Error).message);
      }

      const tradeCcy = summary.price.currency ?? "USD";
      const finCcy = summary.financialData?.financialCurrency ?? tradeCcy;
      const fx = await fxRate(finCcy, tradeCcy);

      res.json(mapYahooToCompany(ticker, { summary, annual, fx }));
    } catch (error: any) {
      console.error(`Market data error for ${ticker}:`, error?.message ?? error);
      const notFound = /not found|No fundamentals|Quote not found/i.test(error?.message ?? "");
      res.status(notFound ? 404 : 502).json({
        error: notFound
          ? `No market data found for "${ticker}".`
          : `Market data provider unavailable for "${ticker}": ${error?.message ?? "unknown error"}`,
      });
    }
  });

  // Fallback only: an LLM estimate of financials. Not verified data; the UI labels it as such.
  app.post("/api/ai/extract", async (req, res) => {
    const ticker = cleanTicker(req.body?.ticker);
    if (!ticker) return res.status(400).json({ error: "Invalid ticker symbol." });
    const key = groqKey();
    if (!key) {
      return res.status(500).json({ error: "GROQ_API_KEY not configured on server. Please add it to your environment." });
    }

    const prompt = `Act as a professional financial data provider. Extract current financial data for the stock ticker "${ticker}".
    I need the following EXACT JSON structure:
    {
      "name": "Full Company Name",
      "ticker": "${ticker}",
      "sector": "Sector Name",
      "currency": "$ or ₹ or £",
      "currentPrice": number,
      "marketCap": number (in millions),
      "revenue": number (LTM, in millions),
      "ebitda": number (LTM, in millions),
      "ebit": number (LTM, in millions),
      "netIncome": number (LTM, in millions),
      "eps": number,
      "da": number (Depreciation/Amortization, in millions),
      "capex": number (CapEx, in millions),
      "netDebt": number (Total Debt - Total Cash, in millions),
      "sharesOutstanding": number (in millions),
      "trailingPE": number,
      "enterpriseToEbitda": number,
      "enterpriseToRevenue": number,
      "revenueGrowth": number (percentage decimal, e.g. 0.15),
      "ebitdaMargin": number (percentage decimal),
      "netMargin": number (percentage decimal),
      "fiscalYear": "FY2023",
      "exchange": "NASDAQ/NYSE/NSE/etc",
      "description": "Short 1-sentence bio"
    }
    Return ONLY the raw JSON object. No markdown, no commentary.`;

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "You are a specialized financial data extraction bot. Output strictly valid JSON." },
            { role: "user", content: prompt },
          ],
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ error: data.error?.message || "AI provider error" });
      }
      res.json(JSON.parse(data.choices?.[0]?.message?.content));
    } catch (error) {
      console.error("Extraction Error:", error);
      res.status(500).json({ error: "Failed to extract data via Groq." });
    }
  });

  // AI investment thesis (narrative only; all figures come from the client's model).
  app.post("/api/ai/thesis", async (req, res) => {
    const { prompt } = req.body ?? {};
    const key = groqKey();
    if (typeof prompt !== "string" || !prompt) return res.status(400).json({ error: "Missing prompt." });
    if (!key) {
      return res.status(500).json({ error: "GROQ_API_KEY not configured on server." });
    }

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "You are a Managing Director at Goldman Sachs M&A. Write professional investment banking-grade M&A theses." },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        return res.status(response.status).json({ error: "AI Provider returned non-JSON response.", details: await response.text() });
      }
      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ error: data.error?.message || data.error?.type || "AI Engine Error" });
      }
      res.json(data);
    } catch (error) {
      console.error("AI Thesis Proxy Error:", error);
      res.status(500).json({ error: "Failed to communicate with Groq engine." });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (!fs.existsSync(path.join(distPath, "index.html"))) {
      console.error('No production build found. Run "npm run build" before "npm start".');
      process.exit(1);
    }
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} (${isProduction ? "production" : "development"})`);
    if (!groqKey()) console.log("GROQ_API_KEY not set: market data works; AI thesis is disabled.");
  });
}

startServer();
