# Skylark Deployment & Operations Guide (DEPLOYMENT.md)

This guide provides instructions for deploying, configuring, and operating the Skylark Executive Business Intelligence Terminal in production environments.

---

## 1. Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 9.0.0 or higher
- **Monday.com Account**: Valid account with access to:
  - Deals Board ID: `5030096083`
  - Work Orders Board ID: `5030096670`
- **Monday.com Personal API Token**: Admin/Developer token with read permissions for GraphQL API v2.

---

## 2. Pre-Deployment Configuration

1. Clone the repository to your server:
   ```bash
   git clone https://github.com/DharmanshooChopra/Skylark.git
   cd Skylark
   ```

2. Install production dependencies:
   ```bash
   npm install --production
   ```

3. Create the production `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` and fill in required values:
   ```ini
   PORT=4000
   NODE_ENV=production
   MONDAY_API_TOKEN=eyJhbGciOiJIUzI1NiJ9...
   MONDAY_DEALS_BOARD_ID=5030096083
   MONDAY_WORKORDER_BOARD_ID=5030096670
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=your_gemini_api_key_here
   CACHE_TTL=300
   REQUEST_TIMEOUT=30000
   ```

---

## 3. Running the Server

### Standard Execution
```bash
npm start
```

### Process Management with PM2 (Recommended for Production)
```bash
# Install PM2 globally if not installed
npm install -g pm2

# Start Skylark application instance
pm2 start src/server.js --name "skylark-terminal"

# Save process list for system reboot recovery
pm2 save
pm2 startup
```

---

## 4. Verifying Connectivity & Deployment

1. **Check System Health**:
   ```bash
   curl http://localhost:4000/api/health
   ```
   *Expected Response (`200 OK`):*
   ```json
   {
     "status": "success",
     "env": "production",
     "monday": {
       "configured": true,
       "dealsBoardId": "5030096083",
       "workOrdersBoardId": "5030096670"
     }
   }
   ```

2. **Verify Live Dashboard Data Ingestion**:
   ```bash
   curl http://localhost:4000/api/dashboard
   ```

3. **Access Executive Terminal Frontend**:
   Open `http://<your-server-ip>:4000` in a web browser.

---

## 5. Troubleshooting & Common Issues

| Symptom | Cause | Resolution |
|---|---|---|
| Process terminates immediately on boot | Missing required environment variable | Ensure `MONDAY_API_TOKEN`, `MONDAY_DEALS_BOARD_ID`, and `MONDAY_WORKORDER_BOARD_ID` are present in `.env`. |
| `MONDAY_API_ERROR` (502) | Expired or invalid Monday API token | Verify token in Monday.com Profile → Developers → My Access Tokens. |
| AI briefings fallback to local deterministic template | Missing or invalid LLM API key | Verify `GEMINI_API_KEY` or `OPENAI_API_KEY` in `.env`. The core analytics and dashboard will continue operating. |
