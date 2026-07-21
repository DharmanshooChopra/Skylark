/**
 * Executive AI Decision Intelligence & Briefing Renderer.
 * Manages Markdown conversion, reasoning trace steps, prompt chips, and copy actions.
 */

import { showToast } from './ui.js';

let rawLastAnswer = '';

/**
 * Markdown to HTML parser for Executive Briefings.
 */
function parseMarkdown(md) {
  if (!md) return '';
  rawLastAnswer = md;
  
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
      return `${prefix}<h3><span class="hdr-icon">📌</span> ${headingText}</h3>`;
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
 * Draws the AI Executive Briefing Report.
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

  emptyState.classList.add('hidden');
  panel.classList.remove('hidden');

  briefContent.innerHTML = parseMarkdown(response.answer);
  confBadge.innerText = `${response.confidence.score}% Confidence`;
  
  confEvidence.innerText = response.confidence.evidence || 'N/A';
  confAssumptions.innerText = response.confidence.assumptions || 'N/A';
  confLimitations.innerText = response.confidence.limitations || 'N/A';
}

/**
 * Draws AI Execution Trace steps.
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
    <div class="trace-item ${step.status}">
      <div class="trace-bullet">
        ${step.status === 'completed' ? '✓' : '●'}
      </div>
      <div class="trace-info">
        <span class="trace-name">${step.step}</span>
        <span class="trace-details">${step.details}</span>
      </div>
    </div>
  `).join('');
}

/**
 * Populates suggested action chips under query bar.
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

/**
 * Copy brief text to user's clipboard.
 */
export function copyBriefToClipboard() {
  if (!rawLastAnswer) return;
  navigator.clipboard.writeText(rawLastAnswer).then(() => {
    showToast('Executive Briefing copied to clipboard.', 'success');
  }).catch(() => {
    showToast('Failed to copy to clipboard.', 'danger');
  });
}
