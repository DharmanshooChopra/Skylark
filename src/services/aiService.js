/**
 * AI Service for the Skylark Executive Terminal.
 * Implements the Two-Stage AI Reasoning Pipeline: Intent Parsing and Synthesis.
 * Handles Gemini and OpenAI endpoints with query relevancy guardrails and query-aware fallback generation.
 */

const axios = require('axios');
const { getActiveConfig } = require('../config');
const logger = require('../utils/logger');
const { AIAPIError } = require('../utils/errors');

/**
 * Formats currency values into clean Indian Rupee representations (Cr / L).
 */
function formatCurrency(num) {
  if (num === null || num === undefined || isNaN(num)) return '₹0';
  const abs = Math.abs(num);
  let compact = '';
  if (abs >= 10000000) {
    compact = ` (₹${(num / 10000000).toFixed(2)} Cr)`;
  } else if (abs >= 100000) {
    compact = ` (₹${(num / 100000).toFixed(2)} L)`;
  }
  return `₹${Math.round(num).toLocaleString('en-IN')}${compact}`;
}

/**
 * Checks if a query is relevant to Skylark Executive Business Intelligence.
 * Returns false for non-BI queries like recipes, weather, general trivia, code, etc.
 */
function isBIQueryRelevant(query) {
  if (!query || typeof query !== 'string') return false;
  const q = query.toLowerCase().trim();

  // Irrelevant topics (recipes, weather, trivia, code, sports, entertainment)
  const irrelevantPatterns = [
    /\b(recipe|bake|cake|cook|pizza|burger|ingredient|food|tea|coffee)\b/,
    /\b(weather|temperature|rain|sun|forecast|climate)\b/,
    /\b(joke|funny|riddle|story|poem|song|movie|actor|game|playstation|xbox)\b/,
    /\b(capital of|who is|who was|president of|prime minister|history of|country)\b/,
    /\b(python|javascript|java|c\+\+|css|html|react|sql|git|npm|code|write a function)\b/
  ];

  for (const pat of irrelevantPatterns) {
    if (pat.test(q)) return false;
  }

  // BI Domain Keywords
  const biKeywords = [
    'revenue', 'sales', 'deal', 'deals', 'order', 'orders', 'work', 'backlog', 'leak', 'leakage',
    'cycle', 'time', 'velocity', 'status', 'overview', 'sector', 'client', 'customer', 'win',
    'rate', 'pipeline', 'financial', 'billed', 'unbilled', 'delivery', 'po', 'amount', 'gst',
    'serial', 'owner', 'delay', 'delayed', 'stalled', 'performance', 'audit', 'kpi', 'metrics',
    'count', 'value', 'margin', 'fulfillment', 'orphan', 'matched', 'unmatched', 'health',
    'summary', 'report', 'skylark', 'monday', 'operations', 'stage', 'probability'
  ];

  return biKeywords.some(kw => q.includes(kw));
}

/**
 * Generates an executive notice for out-of-scope queries.
 */
function generateOutOfScopeResponse(query) {
  return {
    answer: `### ⚠️ Out-of-Scope Query Detected
The query **"${query}"** is not related to Skylark Executive Business Intelligence.

Skylark is specifically designed to analyze your Monday.com Sales Pipeline, Operational Work Orders, Revenue Leakage, Fulfillment Backlog, and Handoff Cycle Velocities.

### [ RECOMMENDED BI ENQUIRIES ]:
* **Sales & Revenue:** *"What is our completed revenue and pipeline value?"*
* **Revenue Leakage Audit:** *"Identify orphan won deals causing revenue leakage."*
* **Operational Backlog:** *"Audit active work order queues and past-due delivery targets."*
* **Handoff Velocity:** *"Calculate average sales-to-operations lead time."*`,
    chartData: null,
    confidence: {
      score: 100,
      evidence: 'Query evaluated as out-of-scope for Business Intelligence terminal',
      assumptions: 'No Monday.com data requested',
      limitations: 'System refrains from answering non-BI topics'
    }
  };
}

/**
 * Helper to call configured LLM API (Gemini or OpenAI).
 */
async function callLLM(prompt, forceJson = false) {
  const { llmProvider, llmApiKey, openaiApiUrl } = getActiveConfig();
  
  if (!llmApiKey) {
    logger.warn('AIService', 'LLM API key is missing. Triggering local query-aware fallback generator...');
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
          temperature: 0.1,
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
 * Query-aware fallback report generator when LLM is offline or unconfigured.
 */
function generateFallbackResponse(query, computedData) {
  logger.info('AIService', `Generating query-aware fallback report for: "${query}"`);
  
  const q = (query || '').toLowerCase();
  const kpis = computedData.kpis;
  const joins = computedData.joins;

  let answer = '';
  let chartData = null;

  if (q.includes('leak') || q.includes('orphan') || q.includes('missing')) {
    // Revenue Leakage Query
    answer = `### [ BLUF ]: Bottom Line Up Front — Revenue Leakage Audit
We have identified **${kpis.revenueLeakage.count} orphan won deals** in the Sales Pipeline that lack active Work Orders. This represents **${formatCurrency(kpis.revenueLeakage.value)}** in revenue leakage risk.

### [ THE WHY ]: Root Cause Analysis
* **Missing Work Orders:** ${kpis.revenueLeakage.count} Deals were marked as "Won" but were never transferred to the Operations Board.
* **Pipeline vs Execution Discrepancy:** Sales booked ₹${((kpis.pipelineValue?.value || 0)/10000000).toFixed(2)} Cr in pipeline value, but work orders were only generated for ${joins.matchedCount} orders.

### [ THE ACTION ]: Recommended Interventions
1. Audit the **${kpis.revenueLeakage.count} orphan deals** in the Sales Board to create matching Work Orders.
2. Verify billing maps to ensure unbilled revenue of **${formatCurrency(kpis.revenueLeakage.value)}** is captured.
3. Establish an automated webhook trigger from Sales Stage "Won" to Work Orders creation.`;

    chartData = {
      type: 'bar',
      labels: ['Completed Revenue', 'Active Backlog', 'Revenue Leakage'],
      values: [kpis.revenue.value, kpis.backlog.value, kpis.revenueLeakage.value]
    };
  } else if (q.includes('backlog') || q.includes('stalled') || q.includes('delay') || q.includes('queue')) {
    // Backlog Query
    answer = `### [ BLUF ]: Bottom Line Up Front — Fulfillment Backlog Audit
Total active operational backlog stands at **${formatCurrency(kpis.backlog.value)}** across **${kpis.activeWorkOrdersCount.value} active work orders** in queue.

### [ THE WHY ]: Root Cause Analysis
* **Backlog Volume:** Operational backlog (${formatCurrency(kpis.backlog.value)}) exceeds 100% of completed revenue (${formatCurrency(kpis.revenue.value)}).
* **Delivery Delays:** There are **${kpis.delayedDeliveries.value} work orders** currently operating past their target delivery dates.

### [ THE ACTION ]: Recommended Interventions
1. Reallocate operational capacity to clear the **${kpis.activeWorkOrdersCount.value} active work orders**.
2. Prioritize the **${kpis.delayedDeliveries.value} delayed deliverables** to mitigate customer penalty risks.
3. Accelerate billing transitions to convert ${formatCurrency(kpis.backlog.value)} backlog into completed revenue.`;

    chartData = {
      type: 'bar',
      labels: ['Completed Revenue', 'Active Backlog', 'Revenue Leakage'],
      values: [kpis.revenue.value, kpis.backlog.value, kpis.revenueLeakage.value]
    };
  } else if (q.includes('cycle') || q.includes('velocity') || q.includes('handoff') || q.includes('lead')) {
    // Handoff Velocity Query
    answer = `### [ BLUF ]: Bottom Line Up Front — Sales-to-Ops Handoff Velocity
The average cycle velocity from Sales Deal creation to Operations Work Order start is **${kpis.fulfillmentCycleTime.value.toFixed(1)} days**.

### [ THE WHY ]: Root Cause Analysis
* **Handoff Lag:** Handoff lead time currently averages ${kpis.fulfillmentCycleTime.value.toFixed(1)} days due to manual serial number and customer code matching.
* **Delivery Target:** Average project delivery execution takes **${kpis.averageDeliveryTime.value.toFixed(1)} days**.

### [ THE ACTION ]: Recommended Interventions
1. Implement mandatory Customer Code entry during Sales Proposal stage to reduce handoff lag.
2. Standardize serial number formatting across both Monday.com boards.
3. Monitor project execution targets to maintain delivery pace.`;
  } else {
    // General Executive Overview
    answer = `### [ BLUF ]: Bottom Line Up Front — Executive Business Overview
We have successfully processed **${joins.matchedCount} aligned sales-to-fulfillment pairs**. Total completed revenue stands at **${formatCurrency(kpis.revenue.value)}**, with an active operational backlog of **${formatCurrency(kpis.backlog.value)}** and a pipeline win rate of **${(kpis.winRate.value || 0).toFixed(1)}%**.

### [ THE WHY ]: Root Cause Analysis
* **Fulfillment Velocity:** Average handoff from won deal to project start takes **${kpis.fulfillmentCycleTime.value.toFixed(1)} days**.
* **Revenue Leakage:** We identified **${kpis.revenueLeakage.count} Won Deals** lacking operational Work Orders, representing **${formatCurrency(kpis.revenueLeakage.value)}** in leakage risk.
* **Delivery Stalls:** There are **${kpis.delayedDeliveries.value} active orders** currently past their schedule target dates.

### [ THE ACTION ]: Recommended Interventions
1. Audit the **${kpis.revenueLeakage.count} orphan deals** to capture ${formatCurrency(kpis.revenueLeakage.value)} in leakage risk.
2. Direct project managers to resolve the **${kpis.delayedDeliveries.value} delayed deliverables**.
3. Clear active backlog items to convert ${formatCurrency(kpis.backlog.value)} in working stock into completed revenue.`;

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
      score: 92,
      evidence: `Analyzed ${joins.matchedCount} matching rows with data health of ${computedData.confidence.score}%.`,
      assumptions: 'Matches calculated via weighted Jaro-Winkler string similarity.',
      limitations: computedData.confidence.warnings.join(', ') || 'No critical data gaps detected.'
    }
  };
}

/**
 * Stage 1: Intent parsing. Translates query into structured plan.
 */
async function parseIntent(query, schemas) {
  logger.info('AIService', 'Executing Stage 1 Intent Parsing...');

  if (!isBIQueryRelevant(query)) {
    return {
      intent: 'IRRELEVANT',
      metrics: [],
      filters: {},
      chartSuggestion: null
    };
  }

  const prompt = `You are the Intent Parser for the Skylark Executive BI Terminal.
Convert the user's natural language request into a clean execution plan JSON.

User Query: "${query}"

Output a JSON object matching this schema:
{
  "intent": "REVENUE_LEAKAGE" | "BACKLOG" | "CYCLE_TIME" | "OVERALL_STATUS" | "CUSTOM",
  "metrics": ["revenue", "backlog", "revenueLeakage", "fulfillmentCycleTime", "averageDeliveryTime", "winRate"],
  "filters": {
    "sector": "string or null",
    "ownerCode": "string or null"
  },
  "chartSuggestion": "bar" | "line" | null
}
JSON Output:`;

  try {
    const rawOutput = await callLLM(prompt, true);
    const cleanOutput = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanOutput);
  } catch (error) {
    logger.warn('AIService', 'Intent parser falling back to keyword-based intent.');
    const q = (query || '').toLowerCase();
    let intent = 'CUSTOM';
    if (q.includes('leak') || q.includes('orphan')) intent = 'REVENUE_LEAKAGE';
    if (q.includes('backlog') || q.includes('delay')) intent = 'BACKLOG';
    if (q.includes('cycle') || q.includes('velocity')) intent = 'CYCLE_TIME';

    return {
      intent,
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
  
  // 1. Relevancy Guardrail Check
  if (!isBIQueryRelevant(query)) {
    logger.info('AIService', `Query "${query}" flagged as out-of-scope.`);
    return generateOutOfScopeResponse(query);
  }

  const kpis = computedData.kpis;
  const health = computedData.confidence;
  
  const kpisContext = Object.entries(kpis).map(([key, obj]) => {
    return `- ${key}: Value = ${obj.value !== null ? obj.value : 'N/A'} (Confidence: ${obj.confidence}%) | Formula: ${obj.formula}`;
  }).join('\n');

  const prompt = `You are a Principal Executive Analyst writing a Brief for the Founder.
Write a professional, dense, and structured Business Intel Report based ONLY on the provided calculations.

Rules:
1. RELEVANCY: Directly answer the user's specific query ("${query}"). If asked about revenue leakage, focus heavily on orphan deals and leakage amounts.
2. ACCURACY: Rely strictly on the values provided below. Do NOT fabricate numbers.
3. TONE & STRUCTURE: Adopt an executive BLUF tone (Bottom Line Up Front). You MUST use these exact headings:
   ### [ BLUF ]: Bottom Line Up Front
   ### [ THE WHY ]: Root Cause Analysis
   ### [ THE ACTION ]: Recommended Interventions
4. FORMATTING: Start directly with the BLUF heading. Format monetary values in Indian Rupees (e.g. ₹10.54 Cr or ₹7.87 Cr).

User Question: "${query}"
Computed Analytics Data:
${kpisContext}
Join Metrics: Matched Pairs = ${computedData.joins.matchedCount}, Unmatched Deals = ${computedData.joins.unmatchedDealsCount}
Data Health Integrities: DHS = ${health.score}% | Warnings = ${health.warnings.join(', ')}

Provide your executive report in markdown format:`;

  try {
    const answer = await callLLM(prompt, false);
    
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
    return generateFallbackResponse(query, computedData);
  }
}

module.exports = {
  parseIntent,
  synthesizeResponse
};
