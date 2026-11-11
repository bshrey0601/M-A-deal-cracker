import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getCompany, diagnostics, MarketDataError } from "./server/marketService";
import { getMarketInputs } from "./server/marketInputs";
import { getPeers } from "./server/peers";
import { getSecPrecedents } from "./server/secDeals";
import { complete, llmLabel, LlmError, NO_AI_KEY, parseJsonReply } from "./server/llm";

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
    res.json({
      status: "ok",
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
      marketData: "sec-edgar+yahoo",
      aiConfigured: Boolean(llmLabel()),
      aiProvider: llmLabel(),
    });
  });

  // Which data providers this deployment can reach right now (no secrets in the output).
  app.get("/api/diagnostics", async (_req, res) => {
    res.json({ ...(await diagnostics()), aiProvider: llmLabel() });
  });

  // Live cost-of-capital inputs: 10-year Treasury, Damodaran ERP, country risk premiums and industry betas.
  app.get("/api/market-inputs", async (_req, res) => {
    res.json(await getMarketInputs());
  });

  // Live price + reported financials (SEC EDGAR / Yahoo Finance, see server/marketService.ts).
  app.get("/api/market/:ticker", async (req, res) => {
    const ticker = cleanTicker(req.params.ticker);
    if (!ticker) return res.status(400).json({ error: "Invalid ticker symbol." });
    // Optional ?price=: a share price the user entered when no live price source answers.
    let manualPrice: number | undefined;
    if (req.query.price !== undefined) {
      manualPrice = Number(req.query.price);
      if (!Number.isFinite(manualPrice) || manualPrice <= 0 || manualPrice > 1e7) {
        return res.status(400).json({ error: "Share price must be a positive number." });
      }
    }
    try {
      res.json(await getCompany(ticker, manualPrice));
    } catch (error: any) {
      const status = error instanceof MarketDataError ? error.status : 500;
      console.error(`Market data error for ${ticker}:`, error?.message ?? error);
      res.status(status === 404 ? 404 : 502).json({
        error: error?.message ?? "Market data unavailable.",
        needsPrice: error instanceof MarketDataError && error.needsPrice,
      });
    }
  });

  // Trading comparables picked by SIC code and size from SEC data (server/peers.ts).
  app.get("/api/peers/:ticker", async (req, res) => {
    const ticker = cleanTicker(req.params.ticker);
    if (!ticker) return res.status(400).json({ error: "Invalid ticker symbol." });
    const exclude = String(req.query.exclude ?? "")
      .split(",")
      .map(cleanTicker)
      .filter((t): t is string => !!t)
      .slice(0, 20);
    try {
      res.json(await getPeers(ticker, exclude));
    } catch (error: any) {
      const status = error instanceof MarketDataError ? error.status : 500;
      console.error(`Peers error for ${ticker}:`, error?.message ?? error);
      res.status(status === 404 ? 404 : 502).json({ error: error?.message ?? "Peers unavailable." });
    }
  });

  // Precedent transactions read from SEC merger filings in the target's industry (server/secDeals.ts).
  app.get("/api/precedents/:ticker", async (req, res) => {
    const ticker = cleanTicker(req.params.ticker);
    if (!ticker) return res.status(400).json({ error: "Invalid ticker symbol." });
    try {
      res.json(await getSecPrecedents(ticker));
    } catch (error: any) {
      const status = error instanceof MarketDataError ? error.status : 500;
      console.error(`Precedents error for ${ticker}:`, error?.message ?? error);
      res.status(status === 404 ? 404 : 502).json({ error: error?.message ?? "Precedents unavailable." });
    }
  });

  // Fallback only: an LLM estimate of financials. Not verified data; the UI labels it as such.
  app.post("/api/ai/extract", async (req, res) => {
    const ticker = cleanTicker(req.body?.ticker);
    if (!ticker) return res.status(400).json({ error: "Invalid ticker symbol." });
    if (!llmLabel()) return res.status(503).json({ error: NO_AI_KEY });

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
      const { text, provider } = await complete({
        system: "You are a specialized financial data extraction bot. Output strictly valid JSON.",
        prompt,
        json: true,
        maxTokens: 4000,
      });
      res.json({ ...parseJsonReply(text), aiProvider: provider });
    } catch (error: any) {
      console.error("Extraction Error:", error?.message ?? error);
      res.status(error instanceof LlmError ? error.status : 500).json({ error: error?.message ?? "AI estimate failed." });
    }
  });

  // AI investment thesis (narrative only; all figures come from the client's model).
  app.post("/api/ai/thesis", async (req, res) => {
    const { prompt } = req.body ?? {};
    if (typeof prompt !== "string" || !prompt) return res.status(400).json({ error: "Missing prompt." });
    if (prompt.length > 20_000) return res.status(400).json({ error: "Prompt too long." });
    if (!llmLabel()) return res.status(503).json({ error: NO_AI_KEY });

    try {
      const { text, provider } = await complete({
        system:
          "You are a Managing Director in an M&A advisory group. Write professional, investment-banking-grade M&A theses. " +
          "Use only the figures given in the prompt; never invent financial numbers.",
        prompt,
      });
      // `choices` keeps the response shape older UI builds read.
      res.json({ content: text, provider, choices: [{ message: { content: text } }] });
    } catch (error: any) {
      console.error("AI Thesis Error:", error?.message ?? error);
      res.status(error instanceof LlmError ? error.status : 500).json({ error: error?.message ?? "AI thesis failed." });
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
    const ai = llmLabel();
    console.log(ai ? `AI writing: ${ai}` : "No AI key set (ANTHROPIC_API_KEY / GEMINI_API_KEY / GROQ_API_KEY): market data works; AI thesis is disabled.");
  });
}

startServer();
