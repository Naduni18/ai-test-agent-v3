# AI Test Agent

An Electron desktop app powered by Claude AI that automatically generates test cases, scaffolds a Cypress framework, writes automation scripts, self-heals fragile locators, and analyzes test failures with AI root cause analysis — all from a requirements document, organized by module for any scale of web application.

---

## Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Generate Test Cases** | Reads your requirements and produces structured TC-N test cases (UI + API) per module |
| 2 | **Create Cypress Framework** | Scaffolds a full Cypress 13 project with page objects, custom commands, fixtures, and a self-heal utility |
| 3 | **Generate Test Scripts** | Converts test cases into runnable `.cy.js` spec files organized by module |
| 4 | **Self-Heal Locators** | Audits selectors that are genuinely broken or likely to break, and proposes a `data-cy → aria → text → CSS` fallback chain — stable selectors (including IDs) are left untouched |
| 5 | **Re-run Self-Heal** | Re-runs only the self-heal phase after agent completion or when loading a saved session, without re-generating test cases or scripts |
| 6 | **AI Failure Analyzer** | Injected into every generated framework — reads Cypress results JSON, calls the AI API, and writes a root-cause analysis report to disk |
| 7 | **GitHub Actions Integration** | Every generated framework includes a workflow that runs Cypress on push/PR, triggers the failure analyzer automatically, and posts the analysis as a PR comment |
| 8 | **Module-based Pipeline** | Runs the full pipeline per module — handles enterprise apps with thousands of test cases |
| 9 | **Select & Regenerate TCs** | Pick specific test cases to regenerate scripts for, with AI-assisted selection |
| 10 | **Upload Requirements** | Upload `.txt`, `.md`, `.pdf`, or `.docx` requirement files directly |
| 11 | **Export to Excel** | Download all generated test cases as a `.csv` file that opens natively in Excel |
| 12 | **Bug Fix Chat** | Built-in AI chat with full code context to fix errors in generated scripts |
| 13 | **Session Save / Load** | Save your entire run (results + chat history) to disk and reload it later |
| 14 | **Extract Files** | Writes all generated framework files directly to a folder on your disk |
| 15 | **Multi-provider Support** | Switch between Claude (Anthropic) and OpenAI models from the sidebar |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Git](https://git-scm.com/)
- An [Anthropic API key](https://console.anthropic.com/) — or an OpenAI API key if using the OpenAI provider

---

## Project structure

```
ai-test-agent/
├── main.js                  # Electron main process + IPC handlers
├── preload.js               # Secure context bridge (IPC)
├── index.html               # UI markup
├── styles.css               # Dark theme design system
├── renderer.js              # All UI logic, agent pipeline, chat
├── agent.js                 # Legacy agent helpers (kept for reference)
├── package.json
├── electron-builder.yml     # Cross-platform build config
├── .env.example             # Environment variable template
├── .gitignore
└── README.md
```

---

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/ai-test-agent.git
cd ai-test-agent
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment (optional)

```bash
cp .env.example .env
```

Edit `.env` and add your API key if you want it pre-filled:

```
ANTHROPIC_API_KEY=sk-ant-...
BASE_URL=https://your-app.com
```

### 4. Run in development mode

```bash
npm start
```

---

## How to use

### Step 1 — Configure

| Field | What to enter |
|-------|--------------|
| AI Provider | Choose Claude (Anthropic) or OpenAI |
| API Key | Your key from [console.anthropic.com](https://console.anthropic.com) or [platform.openai.com](https://platform.openai.com) |
| Model | Select the model — Sonnet 4.6 is recommended for the best speed/quality balance |
| Base URL | The URL of the web app you are testing, e.g. `https://myapp.com` |
| Modules | One module name per line, e.g. `Authentication`, `Shopping Cart`, `Checkout` |
| Requirements | Upload a `.txt` / `.md` / `.pdf` / `.docx` file, or paste text directly |

### Step 2 — Run the agent

Click **Run Agent**. You will be prompted to pick an output folder, then the pipeline runs:

```
Once (shared):
  └── Generate shared config files (package.json, cypress.config.js, commands.js,
      selfHeal.js, .env.example, README.md, AI Failure Analyzer scripts,
      GitHub Actions workflow)

For each module:
  ├── Phase 1 — Generate up to 50 test cases
  ├── Phase 2 — Generate page objects, fixtures, and custom commands
  ├── Phase 3 — Generate spec files (happy-path + edge-cases)
  ├── Phase 4 — Self-heal locators (broken/fragile selectors only)
  └── Write all files to disk immediately
```

### Step 3 — Review output

Use the four tabs to review generated content:

- **Test Cases** — collapsible cards, tagged UI or API, with module headers
- **Framework** — full Cypress project scaffold with all config files
- **Test Scripts** — runnable `.cy.js` spec files per module
- **Self-Heal** — colour-coded locator audit (STALE / REASON / HEALED / STRATEGY)

### Step 4 — Re-run self-heal (optional)

After the agent completes, a **Re-run Self-Heal** button appears. Click it to re-analyze the existing scripts and regenerate the self-heal report without touching test cases or scripts. This also appears when loading a saved session that contains scripts.

> **Self-heal policy:** Only selectors that are genuinely broken or highly likely to break are flagged (e.g. auto-generated IDs, `nth-child` indexes, volatile class names, deeply nested chains). Stable selectors — including meaningful IDs — are left untouched.

### Step 5 — Export

| Button | What it does |
|--------|-------------|
| **Extract Framework** | Opens a folder picker and writes all framework + script files to disk |
| **Download Test Cases as Excel** | Saves a `.csv` with columns: ID, Type, Title, Preconditions, Steps, Expected Result, Priority |
| **Copy** | Copies the current tab's raw output to clipboard |
| **Save** | Saves the current tab's raw output as a file |

### Step 6 — Fix bugs with AI chat

Click **Fix Bugs** (floating button, bottom-right). The chat has full context of your generated framework and scripts. Describe any error or paste a stack trace and the AI will return fixed files in `===FILE===` format. Click **Save fixed files to disk** under any response to write the fixes directly.

### Step 7 — Save and reload sessions

Use **Save** / **Load** in the session bar (bottom of the sidebar) to persist your entire run — all four panels of results plus chat history — to a folder on disk. Reload it later to pick up exactly where you left off, including the Re-run Self-Heal button.

---

## Generated project structure

After running the agent for a 3-module site, your output folder will look like:

```
output-folder/
├── package.json
├── cypress.config.js                  ← JSON reporter pre-configured
├── .env.example
├── README.md
├── scripts/
│   ├── analyze-failures.js            ← AI root cause analyzer (Node.js)
│   └── analyze-failures-local.sh      ← One-command local runner
├── .github/
│   └── workflows/
│       └── ai-failure-analysis.yml    ← GitHub Actions workflow
├── cypress/
│   ├── support/
│   │   ├── commands.js
│   │   └── e2e.js
│   ├── utils/
│   │   └── selfHeal.js
│   ├── pages/
│   │   ├── Authentication/
│   │   │   └── index.js
│   │   ├── ShoppingCart/
│   │   │   └── index.js
│   │   └── Checkout/
│   │       └── index.js
│   ├── fixtures/
│   │   ├── authentication.json
│   │   ├── shopping-cart.json
│   │   └── checkout.json
│   ├── e2e/
│   │   ├── authentication/
│   │   │   ├── happy-path.cy.js
│   │   │   └── edge-cases.cy.js
│   │   ├── shopping-cart/
│   │   │   ├── happy-path.cy.js
│   │   │   └── edge-cases.cy.js
│   │   └── checkout/
│   │       ├── happy-path.cy.js
│   │       └── edge-cases.cy.js
│   └── reports/
│       ├── test-cases-authentication.md
│       ├── test-cases-shopping-cart.md
│       ├── test-cases-checkout.md
│       ├── results.json               ← Written by Cypress after a run
│       └── failure-analysis.md        ← Written by AI analyzer after a run
```

---

## Run the generated Cypress tests

```bash
cd output-folder
npm install

# Open Cypress Test Runner (interactive)
npx cypress open

# Run all tests headlessly (also writes results.json for the analyzer)
npx cypress run

# Run a specific module
npx cypress run --spec "cypress/e2e/authentication/**"
```

---

## AI Failure Analyzer

Every generated framework includes a root-cause analyzer that reads Cypress results and uses AI to explain each failure, categorize it, and suggest a concrete fix.

### Run locally

```bash
cd output-folder

# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# Run the analyzer (runs Cypress first if no results.json exists yet)
bash scripts/analyze-failures-local.sh
```

The report is saved to `cypress/reports/failure-analysis.md`. A preview is also printed to the terminal.

### What the report contains

For every failing test, the analyzer outputs:

| Section | Content |
|---------|---------|
| **ROOT CAUSE** | The exact technical reason the test failed |
| **CATEGORY** | One of: `Selector` / `Timing` / `Network` / `Assertion` / `Config` / `Data` / `Environment` / `Unknown` |
| **FIX** | A concrete code fix or actionable step, with corrected code where applicable |
| **PREVENTION** | How to prevent this class of failure in future tests |

### Run via GitHub Actions

The included `.github/workflows/ai-failure-analysis.yml` workflow:

1. Runs `npm ci` and all Cypress tests on every push to `main`/`develop` and on every pull request
2. Automatically runs the AI failure analyzer after the test run (even if tests fail)
3. Uploads `results.json`, `failure-analysis.md`, screenshots, and videos as downloadable artifacts (retained for 14 days)
4. Posts the full failure analysis as a comment on pull requests

**Setup — add these secrets/variables in your GitHub repository settings:**

| Name | Where | Value |
|------|-------|-------|
| `ANTHROPIC_API_KEY` | Repository secret | Your Anthropic API key |
| `CYPRESS_USERNAME` | Repository secret | Test user email |
| `CYPRESS_PASSWORD` | Repository secret | Test user password |
| `BASE_URL` | Repository variable | Your app's URL (e.g. `https://myapp.com`) |

Then push your framework to GitHub — the workflow triggers automatically.

**Manual trigger:** Go to Actions → "Cypress + AI Failure Analysis" → Run workflow.

---

## Module capacity guide

| App scale | Modules | Claude calls | Files generated |
|-----------|---------|-------------|-----------------|
| Small (5–10 pages) | 2–3 | ~10 | ~25–35 |
| Medium (20–30 pages) | 4–6 | ~20 | ~45–65 |
| Large eCommerce | 8–12 | ~40 | ~85–125 |
| Enterprise (100+ pages) | 15–25 | ~80 | ~155–260 |

Each module generates up to 50 test cases and 5–7 files within the 8,000 token output limit.

---

## Build standalone executables

```bash
# Windows — produces dist/AI Test Agent Setup.exe
npm run build:win

# macOS — produces dist/AI Test Agent.dmg
npm run build:mac

# Linux — produces dist/AI Test Agent.AppImage
npm run build:linux

# All platforms at once
npm run build
```

Built files are output to the `dist/` folder.

> **macOS note:** Right-click the `.app` and choose Open for local testing without a developer certificate.

> **Windows note:** The `.exe` installer is unsigned. Windows Defender may show a SmartScreen warning — click "More info → Run anyway" for local builds.

---

## Environment variables

### AI Test Agent app

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key — can also be entered in the UI at runtime |
| `BASE_URL` | Default base URL for the app under test |
| `USERNAME` | Default test user email |
| `PASSWORD` | Default test user password |
| `API_KEY` | API key for the app under test (used in API test specs) |

### Generated framework (`.env.example`)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Used by the AI failure analyzer script |
| `BASE_URL` | The app under test — also set as `CYPRESS_BASE_URL` |
| `USERNAME` | Test user email |
| `PASSWORD` | Test user password |
| `API_KEY` | API key for the app under test |
| `ANALYZER_MODEL` | AI model for failure analysis (default: `claude-sonnet-4-6`) |

---

## Tech stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| [Electron](https://www.electronjs.org/) | v28 | Desktop shell, file system access, IPC |
| [Claude API](https://docs.anthropic.com/) | claude-sonnet-4-6 | AI backbone for all pipeline phases and failure analysis |
| [electron-builder](https://www.electron.build/) | v24 | Cross-platform packaging (.exe, .dmg, .AppImage) |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | v1.6 | DOCX text extraction |
| Vanilla HTML/CSS/JS | — | Zero frontend framework, zero bundle step |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Run Agent button does nothing | Open DevTools (`Ctrl+Shift+I`) → Console and check for red errors |
| `401 Unauthorized` from API | API key is wrong — Claude keys start with `sk-ant-`, OpenAI keys with `sk-proj-` |
| `403 Forbidden` from API | Missing `anthropic-dangerous-direct-browser-access` header — update `renderer.js` |
| Files not created after Extract | Check DevTools console for `✓ Written:` log lines from `main.js` |
| PDF text not extracted | Install poppler-utils (`brew install poppler` on Mac, `apt install poppler-utils` on Linux) |
| DOCX not extracting | Run `npm install mammoth` and restart |
| Test cases CSV is empty | Open DevTools console, run `copy(results[0])`, paste into a text editor to check parser output |
| Phase 1 stuck running | A previous `startAgent` call is still running — wait or restart the app |
| Excel file garbled characters | Open with Excel → Data → From Text/CSV → select UTF-8 encoding |
| Re-run Self-Heal button missing | It only appears after agent completes or when a session with scripts is loaded — check that Panel 2 (Test Scripts) has content |
| Failure analyzer: `ANTHROPIC_API_KEY is not set` | Run `export ANTHROPIC_API_KEY=sk-ant-...` before running the analyzer script |
| Failure analyzer: `No results file found` | Run `npx cypress run` first, or use `bash scripts/analyze-failures-local.sh` which runs Cypress automatically |
| GitHub Actions: analyzer step skipped | Ensure `ANTHROPIC_API_KEY` is added as a repository secret (Settings → Secrets → Actions) |
| GitHub Actions: PR comment not posted | The workflow needs `issues: write` and `pull-requests: write` permissions — check your repository Actions permissions settings |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m "feat: describe what you added"`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a Pull Request

---

## License

MIT — see [LICENSE](LICENSE) for details.