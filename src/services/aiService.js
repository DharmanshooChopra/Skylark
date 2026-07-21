/**
 * AI Service for the Skylark Executive Terminal.
 * Implements the Two-Stage AI Reasoning Pipeline: Intent Parsing and Synthesis.
 * Handles both Gemini and OpenAI compatible endpoints with automated fallbacks.
 */

const axios = require('axios');
const { getActiveConfig } = require('../config');
const logger = require('../utils/logger');
const { AIAPIError } = require('../utils/errors');

/**
 * Helper to call the configured LLM API (Gemini or OpenAI).
 * 
 * @param {string} prompt 
 * @param {boolean} forceJson Enforces structured JSON output
 * @returns {Promise<string>} Raw text output from LLM
 */
async function callLLM(prompt, forceJson = false) {
  const { llmProvider, llmApiKey, openaiApiUrl } = getActiveConfig();
  
  if (!llmApiKey) {
    logger.warn('AIService', 'LLM API key is missing. Triggering local deterministic fallback...');
    throw new Error('LLM_API_KEY_MISSING');
  }

  try {
    if (llmProvider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${llmApiKey}`;
      
      const payload = {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1, // Low temperature for high deterministic intent & summary
          ...(forceJson && { responseMimeType: 'application/json' })
        }
      };

      const response = await axios.post(url, payload, { timeout: 12000 });
      const candidates = response.data?.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error('Gemini API returned no content candidates.');
      }
      
      return candidates[0].content.parts[0].text;
    } else {
      // OpenAI or compatible (OpenRouter, local models, etc.)
      const url = `${openaiApiUrl}/chat/completions`;
      
      const payload = {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        ...(forceJson && { response_format: { type: 'json_object' } })
      };

      const response = await axios.post(
        url,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${llmApiKey}`
          },
          timeout: 12000
        }
      );

      const choices = response.data?.choices;
      if (!choices || choices.length === 0) {
        throw new Error('OpenAI API returned no choices.');
      }

      return choices[0].message.content;
    }
  } catch (error) {
    logger.error('AIService', 'External LLM API invocation failed', error);
    throw new AIAPIError(
      error.message === 'LLM_API_KEY_MISSING' 
        ? 'LLM credentials are not configured.' 
        : `LLM service request failed: ${error.message}`
    );
  }
}

/**
 * Local deterministic fallback generator if Gemini/OpenAI connection is offline.
 */
function generateFallbackResponse(query, computedData) {
  logger.info('AIService', 'Generating local deterministic fallback report...');
  
  const kpis = computedData.kpis;
  const joins = computedData.joins;
  
  const answer = `### [ BLUF ]: Bottom Line Up Front (System Local Backup Brief)
We have successfully processed **${joins.matchedCount} aligned sales-to-fulfillment pairs**. Total completed revenue stands at **$${kpis.revenue.value.toLocaleString()}**, with an outstanding operational backlog of **$${kpis.backlog.value.toLocaleString()}**. 

### [ THE WHY ]: Root Cause Analysis
* **Fulfillment Velocity:** The average handoff from won deal to project start takes **${kpis.fulfillmentCycleTime.value.toFixed(1)} days**.
* **Pipeline Gaps:** We identified **${kpis.revenueLeakage.count} Won Deals** with no matching operational Work Order, representing **$${kpis.revenueLeakage.value.toLocaleString()}** in delayed execution.
* **Delivery Stalls:** There are **${kpis.delayedDeliveries.value} active orders** currently past their schedule target dates.

### [ THE ACTION ]: Recommended Interventions
1. Audit the **${kpis.revenueLeakage.count} orphan deals** to verify billing maps.
2. Direct project managers to resolve the **${kpis.delayedDeliveries.value} delayed deliverables**.
3. Clear stalled backlog items to convert **$${kpis.backlog.value.toLocaleString()}** in working stock.`;

  return {
    answer,
    chartData: kpis.backlog.value > 0 ? {
      type: 'bar',
      labels: ['Completed Revenue', 'Active Backlog', 'Revenue Leakage'],
      values: [kpis.revenue.value, kpis.backlog.value, kpis.revenueLeakage.value]
    } : null,
    confidence: {
      score: 80,
      evidence: 'Generated via local backup rule-engine templates',
      assumptions: 'Fuzzy company joining matched correctly',
      limitations: 'Report does not possess conversational synthesis'
    }
  };
}

/**
 * Stage 1: Intent parsing. Translates query into structured plan.
 */
async function parseIntent(query, schemas) {
  logger.info('AIService', 'Executing Stage 1 Intent Parsing...');
  
  const prompt = `You are the Intent Parser & Query Planner for the Skylark Executive BI Terminal.
Your task is to convert the user's natural language request into a clean execution plan.
Do NOT execute any math calculations. Do NOT answer the question. Only output JSON.

Available Schema Context:
- Deals Schema Columns: ${JSON.stringify(schemas.deals)}
- Work Orders Schema Columns: ${JSON.stringify(schemas.workOrders)}

User Query: "${query}"

Output a JSON object matching this schema exactly:
{
  "intent": "REVENUE_LEAKAGE" | "BACKLOG" | "CYCLE_TIME" | "OVERALL_STATUS" | "CUSTOM",
  "metrics": ["revenue", "backlog", "revenueLeakage", "fulfillmentCycleTime", "averageDeliveryTime", "winRate"],
  "filters": {
    "sector": "string or null",
    "ownerCode": "string or null"
  },
  "chartSuggestion": "bar" | "line" | "scatter" | null
}
JSON Output:`;

  try {
    const rawOutput = await callLLM(prompt, true);
    // Strip markdown formatting if the LLM wrapped it in ```json ... ```
    const cleanOutput = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanOutput);
  } catch (error) {
    logger.warn('AIService', 'Intent parser failed. Falling back to default plan.');
    return {
      intent: 'CUSTOM',
      metrics: ['revenue', 'backlog', 'revenueLeakage'],
      filters: {},
      chartSuggestion: 'bar'
    };
  }
}

/**
 * Stage 2: Synthesis. Creates the executive brief report.
 */
async function synthesizeResponse(query, computedData) {
  logger.info('AIService', 'Executing Stage 2 Response Synthesis...');
  
  const kpis = computedData.kpis;
  const health = computedData.confidence;
  
  // Format calculations context for prompt
  const kpisContext = Object.entries(kpis).map(([key, obj]) => {
    return `- ${key}: Value = ${obj.value !== null ? obj.value : 'N/A'} (Confidence: ${obj.confidence}%) | Formula: ${obj.formula}`;
  }).join('\n');

  const prompt = `You are a Principal Executive Analyst writing a Brief for the Founder.
Your task is to write a highly professional, dense, and structured Business Intel Report based ONLY on the provided calculations.

Rules:
1. NEVER invent or fabricate any numbers. Rely strictly on the values provided below.
2. If a value is 0 or null, report it exactly as is (do not assume).
3. Adopt an executive, direct, and authoritative tone (BLUF structure: Bottom Line Up Front).
4. Format using Markdown. You must use these exact headings:
   ### [ BLUF ]: Bottom Line Up Front
   ### [ THE WHY ]: Root Cause Analysis
   ### [ THE ACTION ]: Recommended Interventions
5. Avoid conversational greeting fluff (e.g. "Certainly!", "Here is your report"). Start directly with the BLUF heading.

User Question: "${query}"
Computed Analytics Data:
${kpisContext}
Join Metrics: Matched Pairs = ${computedData.joins.matchedCount}, Unmatched Deals = ${computedData.joins.unmatchedDealsCount}
Data Health Integrities: DHS = ${health.score}% | Warnings = ${health.warnings.join(', ')}

Provide your executive report in markdown format:`;

  try {
    const answer = await callLLM(prompt, false);
    
    // Suggest visual charts based on computed outputs
    let chartData = null;
    if (kpis.backlog.value > 0 || kpis.revenue.value > 0) {
      chartData = {
        type: 'bar',
        labels: ['Completed Revenue', 'Active Backlog', 'Revenue Leakage'],
        values: [kpis.revenue.value, kpis.backlog.value, kpis.revenueLeakage.value]
      };
    }

    return {
      answer,
      chartData,
      confidence: {
        score: health.score,
        evidence: `Analyzed ${computedData.joins.matchedCount} matching rows with data health of ${health.score}%.`,
        assumptions: 'Matches calculated via weighted Jaro-Winkler string similarity.',
        limitations: health.warnings.join(', ') || 'No critical data gaps detected.'
      }
    };
  } catch (error) {
    // If LLM fails or is unconfigured, use our deterministic local backup
    return generateFallbackResponse(query, computedData);
  }
}

module.exports = {
  parseIntent,
  synthesizeResponse
};
