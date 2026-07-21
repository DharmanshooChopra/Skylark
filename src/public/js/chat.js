/**
 * Intelligence Query Panel Manager.
 * Renders AI brief reports, execution timelines, and click suggested investigations.
 */

import { store } from './state.js';
import { api } from './api.js';
import { showToast } from './ui.js';
import { renderChart } from './charts.js';

/**
 * Super lightweight, zero-dependency Markdown-to-HTML formatter.
 * Handles headings, bold texts, lists, and double spacing line breaks.
 */
function parseMarkdown(md) {
  if (!md) return '';
  
  const lines = md.split('\n');
  let insideList = false;
  
  const processed = lines.map(line => {
    const trimmed = line.trim();
    
    // Header check
    if (trimmed.startsWith('###')) {
      let headingText = trimmed.replace(/^###\s*/, '');
      let prefix = '';
      if (insideList) {
        insideList = false;
        prefix = '</ul>';
      }
      return `${prefix}<h3>${headingText}</h3>`;
    }
    
    // List check
    if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
      let content = trimmed.replace(/^[*|-]\s*/, '');
      content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      let prefix = '';
      if (!insideList) {
        insideList = true;
        prefix = '<ul>';
      }
      return `${prefix}<li>${content}</li>`;
    }
    
    // Empty row
    if (trimmed === '') {
      if (insideList) {
        insideList = false;
        return '</ul>';
      }
      return '';
    }
    
    // Normal line
    let content = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    let prefix = '';
    if (insideList) {
      insideList = false;
      prefix = '</ul>';
    }
    return `${prefix}<p>${content}</p>`;
  });
  
  if (insideList) {
    processed.push('</ul>');
  }
  
  return processed.join('\n');
}

/**
 * Draws the AI Executive Report in the main pane.
 */
export function renderResponse(response) {
  const panel = document.getElementById('response-panel');
  const emptyState = document.getElementById('query-empty-state');
  const briefContent = document.getElementById('brief-content');
  const confBadge = document.getElementById('brief-confidence');
  
  const confEvidence = document.getElementById('conf-evidence');
  const confAssumptions = document.getElementById('conf-assumptions');
  const confLimitations = document.getElementById('conf-limitations');

  if (!panel || !response) return;

  // Swap empty state for brief
  emptyState.classList.add('hidden');
  panel.classList.remove('hidden');

  // Load content
  briefContent.innerHTML = parseMarkdown(response.answer);
  confBadge.innerText = `${response.confidence.score}% Confidence`;
  
  // Impute details
  confEvidence.innerText = response.confidence.evidence || 'N/A';
  confAssumptions.innerText = response.confidence.assumptions || 'N/A';
  confLimitations.innerText = response.confidence.limitations || 'N/A';
}

/**
 * Draws the monospaced AI Execution Trace timeline.
 */
export function renderReasoningTimeline(timeline) {
  const container = document.getElementById('timeline-steps');
  const card = document.getElementById('timeline-card');
  if (!container || !card) return;

  if (!timeline || timeline.length === 0) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  
  container.innerHTML = timeline.map(step => `
    <div class="timeline-step ${step.status}">
      <div class="step-bullet">
        ${step.status === 'completed' ? '✓' : '●'}
      </div>
      <div class="step-details">
        <span class="step-name">${step.step}</span>
        <span class="step-desc">${step.details}</span>
      </div>
    </div>
  `).join('');
}

/**
 * Populates recommended investigation button flags under the input bar.
 */
export function renderSuggestedActions(actions) {
  const container = document.getElementById('suggested-actions');
  if (!container) return;

  if (!actions || actions.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = actions.map(act => `
    <button class="btn-action-suggest" data-query="${act.query}">
      ${act.label}
    </button>
  `).join('');
}
