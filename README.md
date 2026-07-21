# Skylark Executive Business Intelligence Terminal

An enterprise-grade executive decision-support platform designed for real-time sales pipeline and operational fulfillment intelligence. Built for modern executive leadership, Skylark integrates directly with **Monday.com GraphQL API** to ingest live sales deal funnels and operational work order trackers, transforming raw board items into deterministic executive metrics, revenue leakage audits, multi-chart visual analytics, and AI-synthesized executive briefings.

---

## Executive Summary

Skylark bridges the disconnect between commercial sales pipeline tracking and operational project fulfillment.

By employing a **deterministic analytics-first architecture**, Skylark ensures that all mathematical calculations (Completed Revenue, Active Backlog, Win Rate, Cycle Times, Revenue Leakage) are calculated with 100% precision by a dedicated Business Intelligence Engine before being presented to executive stakeholders. An AI orchestration layer (powered by Gemini or OpenAI) handles natural language intent parsing and synthesizes executive briefings without ever being responsible for math.

---

## Key Features

- **Live Monday.com GraphQL Integration**: Authenticated integration with Monday.com API v2024-01 using cursor-based pagination (`items_page`), exponential backoff retry, and rate-limit (`429`) handling.
- **Canonical Schema Adapter**: Complete decoupler that translates raw Monday.com column IDs (`numeric_mm5f31m2`, `dropdown_mm5f9se1`, etc.) into clean domain entities (`CanonicalDeal`, `CanonicalWorkOrder`).
- **Data Cleaning & Normalization Engine**: Coerces currency strings, standardizes multi-format dates to ISO-8601, resolves status synonyms, fixes column typos (e.g., `"BIlled"` → `"Billed"`), and parses free-text date fields.
- **Deterministic Analytics & Cross-Board Joining**: Fuzzy entity matching using **Jaro-Winkler string similarity** combined with client code, sector, owner code, and date proximity heuristics to link won sales deals to active work orders.
- **Revenue Leakage Audit**: Identifies closed-won sales deals with no corresponding operational work order, flagging uncaptured revenue.
- **Query Relevancy Guardrails & Query-Aware Synthesis**:
  - **Relevancy Filter**: Intercepts out-of-scope non-BI queries (recipes, weather, jokes, trivia) and displays structured executive notices with recommended BI enquiries.
  - **Query-Aware Briefings**: Formulates targeted executive briefs (BLUF format: Bottom Line Up Front, The Why, The Action) customized to the specific query (Revenue Leakage, Backlog, Handoff Velocity, General Overview).
- **Modern 4-Section Executive Terminal SPA**:
  1. **Executive Briefing**: 5 Hero KPI widgets, AI Query Console with prompt chips, synthesized brief with copy button, confidence score, methodology accordion, AI execution trace, and critical business risk alerts.
  2. **Analytics Canvas**: Multi-chart visualization gallery with **Export PNG** capabilities for financial performance, sales pipeline funnel, sector allocation, and execution status.
  3. **System Integrity Center**: SVG circular progress ring for 100% Data Quality Health Score, item breakdown grid, and live system audit timeline feed.
  4. **Canonical Data Ledger**: Enterprise data table with sticky headers, search bar, status filter dropdown, pagination, and an **📥 Export CSV** button.

---

## System Architecture

```
                                  ┌────────────────────────┐
                                  │   Monday.com Boards    │
                                  │ Deals (5030096083)     │
                                  │ Work Orders (5030096670)│
                                  └───────────┬────────────┘
                                              │ GraphQL API v2024-01
                                              ▼
                                  ┌────────────────────────┐
                                  │     mondayService      │
                                  │ (Client, Pagination,   │
                                  │  Schema Adapters)      │
                                  └───────────┬────────────┘
                                              │ Raw Adapted Objects
                                              ▼
                                  ┌────────────────────────┐
                                  │      dataCleaner       │
                                  │  (Normalization,       │
                                  │   Typo/Date Fixing)    │
                                  └───────────┬────────────┘
                                              │ Canonical Entities
                                              ▼
                                  ┌────────────────────────┐
                                  │    analyticsEngine     │
                                  │ (Jaro-Winkler Joins,   │
                                  │  KPIs, Insights)       │
                                  └───────────┬────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
         ┌────────────────────────┐                      ┌────────────────────────┐
         │       aiService        │                      │    Express REST API    │
         │ (Relevancy Guardrails, │                      │ (/api/dashboard, /kpis,│
         │  Intent & Synthesis)   │                      │  /query, /refresh)     │
         └────────────┬───────────┘                      └────────────┬───────────┘
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              ▼
                                 ┌─────────────────────────┐
                                 │ Single-Page Application │
                                 │   Executive Terminal    │
                                 └─────────────────────────┘
```

---

## Technology Stack

- **Backend**: Node.js (>=18.0.0), Express.js
- **HTTP & Integration**: Axios, Monday.com GraphQL API (Version 2024-01)
- **Caching**: `node-cache` (TTL-based in-memory dataset cache)
- **Configuration & Security**: `dotenv` with centralized validation layer (`src/config/index.js`)
- **Frontend**: HTML5, Vanilla CSS3 (Aerospace Command Dark Mode Design System), Vanilla JavaScript (ES6 Modules)
- **Visualization**: Chart.js 4.x
- **LLM Integration**: Google Gemini API (`gemini-1.5-flash`) / OpenAI Chat Completions API (`gpt-4o-mini`)

---

## Folder Structure

```
Skylark/
├── .env                       # Environment variables (ignored by Git)
├── .env.example               # Template environment configuration
├── .gitignore                 # Version control exclusion rules
├── package.json               # Package dependencies & npm scripts
├── README.md                  # Project documentation
├── DECISION_LOG.md            # Architecture decision rationale log
├── DEPLOYMENT.md              # Deployment & Operations Guide
├── SUBMISSION_CHECKLIST.md    # Submission audit checklist
└── src/
    ├── app.js                 # Express application & middleware setup
    ├── server.js              # Server bootstrapper & listener
    ├── config/
    │   └── index.js           # Centralized configuration & validation module
    ├── controllers/
    │   ├── mondayController.js # Board sync, status, and analytics handlers
    │   └── queryController.js  # Natural language BI query endpoint handler
    ├── middleware/
    │   ├── errorHandler.js    # Global centralized error handler
    │   └── validator.js       # Request body validation middleware
    ├── routes/
    │   └── api.js             # REST API endpoint definitions
    ├── services/
    │   ├── aiService.js       # Two-stage AI pipeline with query relevancy guardrails
    │   ├── analyticsEngine.js # Deterministic KPI, Jaro-Winkler join & insight engine
    │   ├── cacheService.js    # NodeCache wrapper service
    │   ├── dataCleaner.js     # Field normalization & quality reporting engine
    │   └── mondayService.js   # Monday.com GraphQL client & schema adapter
    ├── utils/
    │   ├── constants.js       # System defaults and similarity thresholds
    │   ├── errors.js          # Custom domain error classes
    │   └── logger.js          # Structured console logger
    └── public/                # SPA Static Frontend Assets
        ├── index.html         # 4-Section Executive Terminal HTML structure
        ├── css/
        │   └── styles.css     # CSS design system (Aerospace dark mode, glassmorphism)
        └── js/
            ├── api.js         # Frontend HTTP fetch client wrapper
            ├── app.js         # Frontend state orchestrator
            ├── charts.js      # Multi-chart manager & PNG exporter
            ├── chat.js        # AI Briefing & timeline renderer
            ├── dashboard.js   # 5 Hero KPI cards & CSV table exporter
            ├── state.js       # Reactive observable store
            └── ui.js          # DOM manipulation & section view switcher
```

---

## Environment Variables

All configuration is managed exclusively through environment variables via `src/config/index.js`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4000` | HTTP Server Port |
| `NODE_ENV` | No | `development` | Runtime environment (`development` / `production`) |
| `MONDAY_API_TOKEN` | **Yes** | — | Personal API token from Monday.com |
| `MONDAY_DEALS_BOARD_ID` | **Yes** | `5030096083` | Deal Funnel Board ID |
| `MONDAY_WORKORDER_BOARD_ID` | **Yes** | `5030096670` | Work Order Tracker Board ID |
| `LLM_PROVIDER` | No | `gemini` | AI Provider (`gemini` or `openai`) |
| `GEMINI_API_KEY` | If Gemini | — | Google Gemini API Key |
| `OPENAI_API_KEY` | If OpenAI | — | OpenAI API Key |
| `OPENAI_API_URL` | No | `https://api.openai.com/v1` | OpenAI API Base URL |
| `JWT_SECRET` | No | `skylark_dev_secret...` | Secret key for JWT signatures |
| `CACHE_TTL` | No | `300` | Cache time-to-live in seconds (5 minutes) |
| `REQUEST_TIMEOUT` | No | `30000` | Outbound request timeout in milliseconds |
| `ENABLE_CACHE` | No | `true` | Enable/disable in-memory caching |
| `ENABLE_AI` | No | `true` | Enable/disable AI orchestration |
| `ENABLE_ANALYTICS` | No | `true` | Enable/disable analytics computation |
| `LOG_LEVEL` | No | `info` | Logging verbosity (`info`, `debug`, `error`) |

---

## Monday.com Setup

1. Log in to [Monday.com](https://monday.com).
2. Go to **Profile Avatar** → **Developers** → **My Access Tokens** and copy your Personal API Token.
3. Obtain your Board IDs from your Monday.com board URLs:
   - Deals Board ID: `5030096083`
   - Work Orders Board ID: `5030096670`
4. Paste these values into your `.env` file.

---

## Running Locally

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/DharmanshooChopra/Skylark.git
cd Skylark
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env and insert your MONDAY_API_TOKEN
```

### 3. Start the Application
```bash
npm start
```
The terminal will launch at **`http://localhost:4000`**.

---

## API Documentation

### 1. `GET /api/health`
- **Purpose**: System health check and environment verification.
- **Response**:
  ```json
  {
    "status": "success",
    "timestamp": "2026-07-21T10:44:59.310Z",
    "env": "development",
    "monday": {
      "configured": true,
      "dealsBoardId": "5030096083",
      "workOrdersBoardId": "5030096670"
    }
  }
  ```

### 2. `GET /api/dashboard`
- **Purpose**: Returns live KPIs, insights, confidence metrics, and data health summary for the executive terminal UI.
- **Response**:
  ```json
  {
    "status": "success",
    "data": {
      "kpis": {
        "revenue": { "value": 105367383.41, "formula": "Sum of AmountExclGst of all Work Orders with executionStatus = \"Completed\"", "confidence": 100 },
        "pipelineValue": { "value": 688152293.17, "formula": "Sum of Value of all Deals with status = \"Open\"", "confidence": 100 },
        "wonDealsCount": { "value": 165, "formula": "Count of all Deals with status = \"Won\"", "confidence": 100 },
        "backlog": { "value": 106282025.79, "formula": "Sum of AmountExclGst of all Work Orders with executionStatus != \"Completed\"", "confidence": 100 },
        "revenueLeakage": { "value": 78675248.29, "count": 111, "formula": "Sum of Value of Won Deals that have no matched Work Order", "confidence": 85 },
        "winRate": { "value": 56.51, "formula": "Won Deals / (Won Deals + Dead Deals) * 100", "confidence": 100 },
        "fulfillmentCycleTime": { "value": 135.88, "formula": "Average days between Deal Creation and Work Order Start", "confidence": 90 }
      },
      "insights": [ ... ],
      "confidence": { "score": 92, "matchedRecords": 165 },
      "dataHealth": { "confidenceScore": 99, "validRecords": 520 }
    }
  }
  ```

### 3. `GET /api/analytics/kpis`
- **Purpose**: Returns only the KPI calculation block for lightweight widget polling.

### 4. `GET /api/data-health`
- **Purpose**: Returns the data cleaner quality metrics (valid records, status corrections, imputed values).

### 5. `POST /api/refresh`
- **Purpose**: Flushes local in-memory cache and forces a fresh GraphQL query against Monday.com.

### 6. `POST /api/query`
- **Purpose**: Natural language query interface for the executive terminal with query relevancy guardrails.
- **Request Body**:
  ```json
  { "query": "What is our total backlog and revenue leakage?" }
  ```
- **Response**:
  ```json
  {
    "status": "success",
    "data": {
      "answer": "### [ BLUF ]: Bottom Line Up Front — Revenue Leakage Audit\nWe have identified 111 orphan won deals representing ₹7.87 Cr...",
      "chartData": { "type": "bar", "labels": [...], "values": [...] },
      "confidence": { "score": 92 },
      "reasoningTimeline": [ ... ]
    }
  }
  ```

---

## Analytics Engine Details

### Canonical Business Models
All calculations operate strictly on internal canonical models:
- **`CanonicalDeal`**: `id`, `name`, `clientCode`, `ownerCode`, `status`, `stage`, `value`, `sector`, `createdDate`, `closeDate`.
- **`CanonicalWorkOrder`**: `id`, `dealName`, `serialNumber`, `customerCode`, `executionStatus`, `amountExclGst`, `amountInclGst`, `collectedAmount`, `unbilledAmountExclGst`, `billingStatus`, `startDate`, `endDate`, `poDate`, `deliveryDate`.

### Schema Adapter
Translates raw Monday GraphQL responses (e.g. `numeric_mm5f31m2`, `color_mm5f9xkm`) into canonical models using `.text` for status/dropdown labels and `parseFloat()` for numbers.

### Matching Engine (Jaro-Winkler)
Links Deals to Work Orders based on a weighted scoring matrix:
1. **Name Similarity (Jaro-Winkler)**: 40% weight
2. **Client Code Digit Match**: 20% weight
3. **Sector Match**: 15% weight
4. **Owner Code Match**: 15% weight
5. **Date Proximity**: 10% weight

Pairings scoring $\ge 0.50$ are linked greedy-style by top score.

---

## Security & Privacy

- **Token Masking**: API Tokens are truncated (e.g., `eyJhbGciOi...`) in all log output.
- **Credential Protection**: Hardcoded credentials are strictly prohibited. All configuration must be provided via `.env`.
- **Production Guard**: Detailed stack traces are suppressed in production mode (`NODE_ENV=production`).

---

## Deployment & Operations

Refer to [`DEPLOYMENT.md`](file:///d:/wwwdh/Desktop/SkyLark/DEPLOYMENT.md) for full production deployment instructions.