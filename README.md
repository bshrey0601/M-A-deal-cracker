M&A Deal Cracker

An AI-powered web application that analyzes mergers & acquisitions deals — extracting key terms, surfacing valuation drivers, and explaining deal structure in plain English using Google's Gemini API.

🔗 Live Demo: [m-a-deal-cracker.onrender.com](https://m-a-deal-cracker.onrender.com/)

📖 Overview
M&A Deal Cracker is built for finance students, analysts, and anyone who wants to quickly understand the structure and economics of an M&A transaction without slogging through hundreds of pages of disclosures. Paste a deal summary, press release, or 8-K excerpt, and the app uses a large language model to break down what's actually happening in the deal.
<!-- TODO: Replace this paragraph with your actual project description if it differs.
Example variations:
- "...analyzes M&A press releases and surfaces the deal terms that matter."
- "...accepts a target company name and pulls together a deal-readiness summary."
- "...walks through a sample deal step-by-step for educational purposes." -->
✨ Features

🧠 AI-powered analysis — Uses Google Gemini to interpret deal documents and produce structured insights
💰 Deal economics — Surfaces purchase price, consideration mix (cash vs. stock), implied multiples, and premium paid
📊 Structure breakdown — Identifies whether the deal is a stock purchase, asset purchase, merger, or tender offer
⚠️ Risk flags — Highlights material adverse change clauses, financing conditions, regulatory hurdles, and break fees
🌐 Web-based interface — No installation needed; works in any modern browser
⚡ Fast turnaround — Most analyses complete in under 30 seconds

<!-- TODO: Trim or edit this list to match what the app actually does. -->
🛠️ Tech Stack
Frontend

HTML5 / CSS3 / JavaScript
Built initially with Google AI Studio

<!-- TODO: Add framework if used (e.g., React, Vue, plain JS) -->
Backend / AI

Google Gemini API (via @google/generative-ai SDK)

Deployment

Render (static site / web service)

<!-- TODO: Add anything else: Tailwind, TypeScript, Vite, etc. -->
🚀 Getting Started
Prerequisites

Node.js 18+ and npm
A Google AI Studio API key — get one free at aistudio.google.com

Installation
bash# Clone the repository
git clone https://github.com/<your-username>/m-a-deal-cracker.git
cd m-a-deal-cracker

# Install dependencies
npm install

# Set up your environment variables (see below)
cp .env.example .env

# Run locally
npm run dev
The app should now be live at http://localhost:3000 (or whichever port your dev server uses).
Environment Variables
Create a .env file in the root directory:
envGEMINI_API_KEY=your_google_ai_studio_api_key_here

⚠️ Never commit your .env file. It's already listed in .gitignore.

📂 Project Structure
m-a-deal-cracker/
├── public/              # Static assets
├── src/
│   ├── components/      # UI components
│   ├── services/        # Gemini API wrapper
│   ├── prompts/         # System prompts for the LLM
│   └── App.js           # Main app entry
├── .env.example
├── .gitignore
├── package.json
└── README.md
<!-- TODO: Adjust to match your real folder structure. Run `tree -L 2` to generate it. -->
💡 Usage

Open the live demo or run the app locally
Paste an M&A deal description, press release excerpt, or news summary into the input field
Click Analyze
Review the structured breakdown — deal terms, financial highlights, structural notes, and key risks

Example Input

"Microsoft announced today that it will acquire Activision Blizzard in an all-cash transaction valued at $68.7 billion, or $95.00 per share. The deal is expected to close in fiscal year 2023, subject to customary closing conditions including regulatory approval and Activision shareholder approval."

Example Output (abbreviated)

Deal Type: All-cash acquisition
Consideration: $95.00/share (100% cash)
Enterprise Value: ~$68.7B
Closing Conditions: Regulatory approval, shareholder vote
Key Risks Flagged: Antitrust scrutiny given target's scale in gaming

🚢 Deployment
The live version is deployed on Render as a [static site / web service].
To deploy your own copy:

Push your fork to GitHub
Create a new Web Service on render.com
Connect your repo
Add GEMINI_API_KEY under Environment → Environment Variables
Set the build command and start command per Render's Node.js docs
Deploy

🗺️ Roadmap

 PDF upload (parse 8-Ks and tender offer documents directly)
 Comparable transactions lookup
 Side-by-side comparison of multiple deals
 Save analysis history per user
 Export results to PDF / Excel

<!-- TODO: Edit roadmap to match your actual plans (or delete if not applicable) -->
🤝 Contributing
Contributions, issues, and feature requests are welcome. Feel free to open an issue or submit a pull request.
📄 License
This project is licensed under the MIT License — see the LICENSE file for details.
<!-- TODO: Pick a license. MIT is the default for personal/portfolio projects. If unsure, leave as MIT. -->
👤 Author
Shrey Bhatt

📧 bshrey@wustl.edu
💼 LinkedIn: www.linkedin.com/in/shreybhatt0601
🎓 M.S. Business Analytics — FinTech, Washington University in St. Louis
