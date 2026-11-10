# M&A Deal Cracker

A web app for analysing a merger or acquisition between two listed companies: it pulls live market data and reported financials for the target and acquirer, then walks through WACC, precedent transactions, a DCF with sensitivity analysis, deal structuring (accretion/dilution, synergies, purchase price allocation), and an AI-written investment thesis you can export to PDF.

🔗 Live demo: [m-a-deal-cracker.onrender.com](https://m-a-deal-cracker.onrender.com/)

## What it does

| Module | What you get |
| --- | --- |
| **Fetch & Verify** | Live price, market cap, LTM revenue, EBITDA, EBIT, net income, D&A, CapEx, net debt and multiples from SEC EDGAR filings (US companies) or Yahoo Finance, with live prices. Every company card shows the data source, quote time and any caveats (e.g. currency conversion, missing fields). |
| **Financial Modeling** | WACC build-up (CAPM). Live inputs: the 10-year US Treasury yield (U.S. Treasury, FRED as fallback), Damodaran's current industry betas, equity risk premium and country risk premiums. Each input shows its source, date and link, or "Edited by you". |
| **Market Cross-Check** | Trading comparables picked automatically from SEC data: listed companies with the target's SIC industry code, closest to it in annual revenue, each loaded from its own filings with a live price. Shows EV/Revenue, EV/EBITDA and P/E with 25th/median/75th percentiles and the target price each median implies; peers can be unticked, removed or added by ticker. Also benchmarks the offer against a curated set of precedent transactions. |
| **AI Deal Engine** | 5-year unlevered DCF with bear/base/bull scenarios and a WACC × terminal-growth sensitivity grid. Tax rate, D&A and CapEx are editable and flow through every cell. |
| **Deal Structuring** | Cash/stock mix, financing cost, synergies with realisation rates, PPA (goodwill, intangibles, amortisation) and pro-forma EPS accretion/dilution with a sensitivity table. |
| **Thesis & Review** | Football field chart of implied value per share by method (52-week range, DCF bear-to-bull and WACC/growth sensitivity, precedent EV/EBITDA, EV/Revenue and control premiums as 25th–75th percentile ranges), with the offer and today's price marked. Below it, a board-style investment memo written by an LLM from the model's figures, exportable to PDF. |

### Where the numbers come from

| Data | Source | Key needed? |
| --- | --- | --- |
| Financials for US-listed companies (revenue, operating income, net income, D&A, CapEx, cash, debt, equity, shares) | **SEC EDGAR** XBRL filings (10-K / 10-Q), as filed | No |
| Financials for other markets (e.g. `.NS`, `.L`, `.T`) | **Yahoo Finance** | No |
| Share prices | **Finnhub** (US, when a key is set), then **Yahoo Finance** chart data, then **CNBC** and **Stooq** (US) | Finnhub only (free) |

- Flow figures from SEC filings are **last twelve months**: latest fiscal year + current year-to-date − prior-year year-to-date. Balance-sheet figures are from the latest filing. EBITDA = operating income + D&A; net debt = borrowings − cash and short-term investments (leases excluded).
- **Automatic accuracy checks.** Every SEC-sourced company card runs these checks and shows the result (passed, to review, failed or skipped). Gaps above 2% are flagged:
  - the cited filings add up exactly to each figure shown
  - the balance sheet balances (assets = liabilities + equity)
  - no period used was restated after it was first filed
  - computed EPS matches the diluted EPS the company filed
  - current shares are consistent with weighted-average diluted shares
  - debt and cash are from the same balance-sheet date
  - the filings and the share price are recent
  - no impossible values (e.g. operating income above revenue)
  - revenue matches a second, independent source (Yahoo Finance). This check is skipped when Yahoo blocks the server.
- **Fact-checked AI memo.** The AI gets a fact sheet of every figure in the model, and is told to use only those numbers. Once the memo is written, the app finds every number in it and matches it back to the fact sheet. Matched numbers are underlined in green; hover over one to see the figure and its source. Numbers that match nothing (e.g. invented synergies or an outside benchmark) are highlighted in red. A banner says how many numbers were checked and lists any that failed.
- **Due diligence red flags.** For SEC filers, the Fetch page screens both companies using their filings. Each finding links the filings it used. These are screening signals that show where to look; they don't replace reading the filings. The checks are:
  - bankruptcy risk (Altman Z, or Z'' for non-manufacturers)
  - earnings manipulation risk (Beneish 8-variable M-score)
  - whether profit is backed by operating cash flow
  - debt load (net debt / EBITDA and interest cover)
  - over the last 3 years: restatements (8-K item 4.02), auditor changes (4.01), bankruptcy (1.03), delisting notices (3.01), late-filing notices (NT 10-K/10-Q) and amended reports
- **Trading comps.** `/api/peers/:ticker` finds the target's SIC code in its SEC submissions, lists every company EDGAR files under that code (`browse-edgar?action=getcompany&SIC=`), keeps those with a ticker in `company_tickers.json`, and ranks them by how close their last calendar-year revenue (XBRL frames API) is to the target's. If fewer than six are found, related codes in the same 3-digit industry group are added and labelled. The six closest are loaded exactly like the target (SEC financials + live price); any that can't be loaded are listed as skipped. Multiples over 50x EV/Revenue or 100x EV/EBITDA or P/E, or negative ones, are shown as NM and left out of the statistics.
- **Live cost-of-capital inputs.** `/api/market-inputs` serves the latest 10-year Treasury par yield (home.treasury.gov, or FRED DGS10 if it's down) and Damodaran's (NYU Stern) unlevered industry betas, mature-market equity risk premium and country risk premiums. They are cached for 12 hours. If a source can't be reached, the WACC page says so and falls back to built-in defaults labelled "Built-in default (not live)".
- **Click any number to see its source.** On each company card, every underlined figure opens the exact SEC filing behind it: the XBRL line item, the period, the value as filed, the form (10-K / 10-Q), the filing date, the accession number and a link to the document on SEC.gov. Calculated figures (EBITDA, margins, multiples) show their formula and link to their inputs. **All sources** lists every figure with its filing. Prices are labelled as market data (not from a filing), and Yahoo-sourced figures for non-US companies say that they aren't linked to an official filing.
- Every company card shows its sources, the price date and any caveats (currency conversion, fields a company doesn't report). Missing data is flagged, never invented.
- Cloud hosts' shared IP addresses are often blocked by Yahoo (HTTP 429, "Too Many Requests"). That's why US financials come from the SEC and prices have several fallbacks. For the most reliable prices on a cloud host, add a free `FINNHUB_API_KEY`. If the financials load but no price source answers, the app asks you to type in the current share price (labelled "entered by user") instead of failing. For non-US companies Yahoo is the only free source, so if Yahoo is blocking the server the app says so and backs off for 10 minutes instead of retrying.
- To see which providers your deployment can reach, open `/api/diagnostics` on your server (e.g. `https://m-a-deal-cracker.onrender.com/api/diagnostics`). It also shows the deployed commit and whether `SEC_USER_AGENT` and `FINNHUB_API_KEY` are set (never their values).
- Results are cached briefly (prices 1 min, company data 5 min, SEC filings 6 h) to stay well within provider limits.
- If live data can't be fetched, you can choose **Use AI estimate**. Those figures are generated by an LLM, are **not verified**, and are clearly labelled as estimates. Do not rely on them for real decisions.
- Model outputs are only as good as the inputs and assumptions. Check key figures against the company's filings before relying on them.

## Run it locally

**Prerequisites:** Node.js 22 or newer and npm.

```bash
git clone https://github.com/bshrey0601/M-A-deal-cracker.git
cd M-A-deal-cracker
npm install
cp .env.example .env      # then add ANTHROPIC_API_KEY, GEMINI_API_KEY or GROQ_API_KEY for the AI thesis
npm run dev
```

Open http://localhost:3000. Try tickers such as `AAPL` / `MSFT`, or `RELIANCE.NS` / `TCS.NS` for NSE-listed companies (Yahoo symbol format: `.NS` NSE, `.BO` BSE, `.L` London, `.T` Tokyo, `.HK` Hong Kong).

To run the production build locally:

```bash
npm run build
npm start
```

### Environment variables

| Variable | Required? | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` | Optional (set one) | Enables the AI investment thesis and the "Use AI estimate" fallback. Used in that order: Claude ([console.anthropic.com](https://console.anthropic.com)), Gemini ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)), Groq ([console.groq.com/keys](https://console.groq.com/keys)). `ANTHROPIC_MODEL`, `GEMINI_MODEL` and `GROQ_MODEL` override the default models. AI only writes analysis; it is never the source of the financial figures. Without a key, everything except those two features works. |
| `PORT` | Optional | Port to listen on (default `3000`). |
| `SEC_USER_AGENT` | Recommended for your own deployment | Your name and contact email (e.g. `Jane Doe jane@example.com`). The SEC rejects automated clients that don't give a contact email. If unset, the app's owner's contact is used (see `DEFAULT_SEC_USER_AGENT` in `server/marketService.ts`). |
| `FINNHUB_API_KEY` | Recommended on cloud hosts | Most reliable price source for US stocks; used first when set. Free key at [finnhub.io/register](https://finnhub.io/register). |
| `CORS_ORIGINS` | Optional | Server only. Origins allowed to call the API from another site; defaults to `https://*.github.io`. |
| `VITE_API_BASE_URL` | Optional | Build time only. Server URL for a separately hosted interface (set by the Pages workflow). |

Never commit your `.env`; it is already in `.gitignore`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (Express + Vite with hot reload) on port 3000 |
| `npm run build` | Builds the frontend into `dist/` |
| `npm start` | Serves the production build and API |
| `npm test` | Unit tests for the DCF, accretion/dilution, data mapping and source fallbacks |
| `npm run lint` | TypeScript type check |

## Deploy

The app has two parts: the React interface and a small Node server that fetches market data and calls the AI. **Live data only works where the Node server runs.**

### Option 1: Render (recommended, everything in one place)

The repo includes a `render.yaml` blueprint.

1. In Render, choose **New → Blueprint** and connect this repository (or **New → Web Service** with build command `npm ci && npm run build` and start command `npm start`).
2. Under **Environment**, set `SEC_USER_AGENT` to your name and email, `FINNHUB_API_KEY` (free) for reliable prices, and one AI key (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY` or `GROQ_API_KEY`) if you want the AI thesis.
3. Deploy. Health check: `/api/health`.

Any Node 22 host works the same way: run `npm ci && npm run build`, then `npm start`; the server reads `PORT` from the environment.

### Option 2: GitHub Pages for the interface + Render for the server

GitHub Pages only serves static files, so it can host the interface but not the Node server. The workflow in `.github/workflows/deploy-pages.yml` builds the interface and points it at the Render server.

1. Deploy the server on Render (Option 1).
2. In GitHub, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. (With "Deploy from a branch", Pages serves the raw source files and the page is blank.)
3. If your Render URL is not `https://m-a-deal-cracker.onrender.com`, add a repository variable `API_BASE_URL` with your server URL (**Settings → Secrets and variables → Actions → Variables**).
4. Push to `main` (or run the workflow manually from the **Actions** tab). The site appears at `https://<your-username>.github.io/M-A-deal-cracker/`.

The server accepts requests from any `https://<user>.github.io` page by default. To restrict or change that, set `CORS_ORIGINS` on the server to a comma-separated list of allowed origins.

If the Pages site can't reach the server, it shows a "Data server not connected" notice instead of a blank page.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Motion, jsPDF + html2canvas
- **Backend:** Express (serves the app and proxies data/AI calls so keys stay server-side)
- **Data:** SEC EDGAR XBRL API, Yahoo Finance (`yahoo-finance2` and the chart API), CNBC and Stooq quotes, optional Finnhub
- **AI:** Groq (`llama-3.1-8b-instant`) for the thesis narrative

## Project structure

```
server.ts                  Express server: /api/market/:ticker, /api/ai/*, static hosting
server/marketService.ts    Data-source fallbacks, caching and retries
src/
  App.tsx                  Shell and panel routing
  context/DealContext.tsx  Shared deal state
  components/panels/       Fetch, WACC, Precedents, DCF, Deal Structuring, Thesis
  lib/dcf.ts               DCF engine (shared by scenarios and sensitivity grid)
  lib/accretion.ts         Accretion/dilution, synergies, PPA
  lib/secFacts.ts          Maps SEC EDGAR filings (LTM, balance sheet) to the app's data model
  lib/marketData.ts        Maps Yahoo Finance responses to the app's data model
  lib/quote.ts             Parses price quotes from Yahoo, CNBC, Stooq and Finnhub
  services/dataService.ts  Client calls to the server API
  constants.ts             Industry betas, country risk data, precedent deals
render.yaml                Render deployment blueprint
.github/workflows/         GitHub Pages build and deploy
```

## Disclaimer

For education and analysis practice only. Not investment advice.

## Author

**Shrey Bhatt** · M.S. Business Analytics (FinTech), Washington University in St. Louis

- Email: bshrey@wustl.edu
- LinkedIn: [linkedin.com/in/shreybhatt0601](https://www.linkedin.com/in/shreybhatt0601)
