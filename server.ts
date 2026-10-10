import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getCompany, MarketDataError } from "./server/marketService";

dotenv.config();

// Tickers like AAPL, BRK-B, RELIANCE.NS, 0700.HK, ^GSPC. Also keeps user input out of LLM prompts.
const TICKER_RE = /^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$/;
const cleanTicker = (v: unknown) => {
  const t = String(v ?? "").trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
};

const isProduction = process.env.NODE_ENV === "production" || process.argv.includes("--production");

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const groqKey = () => process.env.GROQ_API_KEY?.trim();

  app.use(express.json({ limit: "100kb" }));

  // Allow the UI to be hosted elsewhere. CORS_ORIGINS is a comma-separated list or "*";
  // when unset, GitHub Pages sites (https://<user>.github.io) are allowed.
  const corsOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map(o => o.trim()).filter(Boolean);
  const corsAllowed = (origin: string) =>
    corsOrigins.length
      ? corsOrigins.includes("*") || corsOrigins.includes(origin)
      : /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin);
  app.use("/api", (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && corsAllowed(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", marketData: "sec-edgar+yahoo", aiConfigured: Boolean(groqKey()) });
  });

  // Live price + reported financials (SEC EDGAR / Yahoo Finance, see server/marketService.ts).
  app.get("/api/market/:ticker", async (req, res) => {
    const ticker = cleanTicker(req.params.ticker);
    if (!ticker) return res.status(400).json({ error: "Invalid ticker symbol." });
    try {
      res.json(await getCompany(ticker));
    } catch (error: any) {
      const status = error instanceof MarketDataError ? error.status : 500;
      console.error(`Market data error for ${ticker}:`, error?.message ?? error);
      res.status(status === 404 ? 404 : 502).json({ error: error?.message ?? "Market data unavailable." });
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
