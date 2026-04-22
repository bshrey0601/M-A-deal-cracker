import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // AI Data Extraction Proxy
  app.post("/api/ai/extract", async (req, res) => {
    const { ticker } = req.body;
    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      return res.status(500).json({ error: "GROQ_API_KEY not configured on server. Please add it to your secrets." });
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
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey.trim()}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "You are a specialized financial data extraction bot. Output strictly valid JSON." },
            { role: "user", content: prompt }
          ],
          temperature: 0,
          response_format: { type: "json_object" }
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      
      const content = data.choices?.[0]?.message?.content;
      res.json(JSON.parse(content));
    } catch (error) {
      console.error("Extraction Error:", error);
      res.status(500).json({ error: "Failed to extract market data via Groq." });
    }
  });

  // AI Thesis Proxy
  app.post("/api/ai/thesis", async (req, res) => {
    const { prompt } = req.body;
    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      return res.status(500).json({ error: "GROQ_API_KEY not configured on server." });
    }

    try {
      console.log("Engaging Groq Engine [llama-3.1-8b-instant]");
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey.trim()}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "You are a Managing Director at Goldman Sachs M&A. Write professional investment banking-grade M&A theses." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
        }),
      });

      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        return res.status(response.status).json({ error: "AI Provider returned non-JSON response.", details: text });
      }

      if (!response.ok) {
        return res.status(response.status).json({ 
          error: data.error?.message || data.error?.type || "AI Engine Error",
          details: data
        });
      }

      res.json(data);
    } catch (error) {
      console.error("AI Thesis Proxy Error:", error);
      res.status(500).json({ error: "Failed to communicate with Groq engine." });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
