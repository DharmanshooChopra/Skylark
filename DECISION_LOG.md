# Architectural Decision Log (DECISION_LOG.md)

**Project:** Skylark Executive Business Intelligence Terminal  
**Role:** Principal Data Platform Engineer & Systems Architect  
**Status:** Approved & Finalized  

---

## 1. Executive Summary

This document records the fundamental technical and architectural decisions governing the Skylark Executive Business Intelligence Platform. The design prioritizes **deterministic computational accuracy**, **robust data decoupling**, **defensive API integration**, and **zero-hallucination executive decision support**.

---

## 2. Key Architecture Decisions & Trade-Offs

### ADR 1: Direct Integration with Monday.com GraphQL API v2024-01
- **Context:** Raw operational and sales data lives in Monday.com boards (`Deals: 5030096083`, `Work Orders: 5030096670`).
- **Decision:** Ingest live data using Monday.com's official GraphQL v2024-01 API rather than static CSV exports or relational database sync mirrors. Use cursor-based pagination (`items_page`) for all board fetches.
- **Rationale:** Live GraphQL queries provide single-source-of-truth accuracy without building complex, stateful ETL database sync pipelines.
- **Trade-Off Accepted:** API response latency depends on Monday.com network availability; mitigated via short-lived in-memory caching (`CACHE_TTL=300`).

### ADR 2: Schema Adapter & Canonical Domain Isolation
- **Context:** Monday.com GraphQL exposes auto-generated column IDs (e.g., `numeric_mm5f31m2`, `dropdown_mm5f9se1`).
- **Decision:** Implement a strict Schema Adapter layer in `mondayService.js` to map raw Monday structures immediately into internal domain models (`CanonicalDeal`, `CanonicalWorkOrder`).
- **Rationale:** Prevents Monday-specific column hashes or API structures from leaking into downstream business logic, data cleaning, analytics, or UI code. If column IDs change on Monday.com, only the adapter requires updating.
- **Trade-Off Accepted:** Extra transformation step during payload ingestion; overhead is negligible ($O(N)$ single-pass array map).

### ADR 3: Canonical Models as Single Source of Truth
- **Context:** Raw spreadsheet exports and Monday board items contain inconsistent keys, missing fields, and varied data types.
- **Decision:** All analytics, reporting, and AI reasoning modules consume *only* validated canonical objects (`CanonicalDeal`, `CanonicalWorkOrder`).
- **Rationale:** Ensures strict type safety, predictable field names, and clean separation of concerns.

### ADR 4: Deterministic Analytics Engine (Zero-LLM Math)
- **Context:** LLMs are prone to hallucination, floating-point math errors, and non-deterministic variations when calculating financial figures.
- **Decision:** Move all mathematical aggregations (Revenue, Pipeline, Backlog, Win Rate, Fulfillment Cycle Times, Revenue Leakage) into a dedicated, deterministic JavaScript analytics engine (`analyticsEngine.js`).
- **Rationale:** Guarantees 100% mathematical precision and reproducibility. The LLM is never allowed to calculate or alter financial figures.

### ADR 5: AI as an Orchestration & Briefing Layer Only
- **Context:** Executive users require structured, natural-language insights alongside quantitative data.
- **Decision:** The AI engine (`aiService.js`) operates purely as a two-stage orchestrator:
  1. **Stage 1 (Intent Parser):** Translates user natural language into structured JSON execution plans.
  2. **Stage 2 (Response Synthesizer):** Formulates executive summaries (BLUF format) consuming *only* deterministic output from `analyticsEngine.js`.
- **Rationale:** Delivers natural language interaction while maintaining absolute auditability and numerical integrity. Includes a local rule-based fallback generator if LLM services are unavailable.

### ADR 6: Multi-Factor Jaro-Winkler Matching Engine for Cross-Board Joins
- **Context:** Work Orders track a `Serial #` (e.g., `SDPLDEAL-075`), but Deals boards lack a direct Serial # column, relying instead on client codes and deal names.
- **Decision:** Implement a multi-factor weighted scoring matrix in `analyticsEngine.js`:
  - Name Similarity (Jaro-Winkler): 40%
  - Client Code Digit Match: 20%
  - Sector Match: 15%
  - Owner Code Match: 15%
  - Date Proximity: 10%
- **Rationale:** High-accuracy fuzzy matching links deals to work orders without requiring manual cross-board relational keys or schema modifications on Monday.com.

### ADR 7: Centralized Configuration & Environment Encapsulation
- **Context:** Application modules must access environment variables safely without risking credential leaks.
- **Decision:** Create a single, fail-fast configuration layer (`src/config/index.js`). No module is allowed to read `process.env` directly.
- **Rationale:** Validates all required environment variables (`MONDAY_API_TOKEN`, board IDs) at application boot, applies typed defaults, masks sensitive keys in logs, and supports runtime UI settings overrides.

---

## 3. Known Limitations & Future Evolution

1. **Free-Text Dates:** The `Collection Date` column on the Work Orders board is free-text rather than a native Monday date column; handled defensively via flexible string parsing.
2. **In-Memory Caching:** Currently uses single-node `node-cache`. Future scaling to multi-instance deployments would warrant replacing this with Redis.
