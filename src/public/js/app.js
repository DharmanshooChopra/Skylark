/**
 * Application Orchestrator.
 * Connects API layers, state events, UI drawer controls, and renderers.
 */

import { api } from './api.js';
import { store, subscribe } from './state.js';
import { 
  showToast, 
  showErrorBanner, 
  hideErrorBanner, 
  toggleSettings, 
  switchView, 
  renderKpiSkeletons 
} from './ui.js';
import { 
  renderKPIs, 
  renderDataHealth, 
  renderActivityLog, 
  renderLedgerTable 
} from './dashboard.js';
import { 
  renderResponse, 
  renderReasoningTimeline, 
  renderSuggestedActions 
} from './chat.js';
import { renderChart } from './charts.js';

// Global variables for caching raw ledger rows locally
let cachedRawDeals = [];
let cachedRawWOs = [];

/**
 * Reactive State Dispatch Handler.
 */
function handleStateChange(state, prop) {
  switch (prop) {
    case 'connectionStatus':
      const badge = document.getElementById('connection-badge');
      const text = badge.querySelector('.badge-text');
      if (state.connectionStatus === 'connected') {
        badge.className = 'connection-badge online';
        text.innerText = 'ONLINE';
      } else {
        badge.className = 'connection-badge offline';
        text.innerText = 'OFFLINE';
      }
      break;

    case 'syncTime':
      document.getElementById('sync-time').innerText = state.syncTime;
      break;

    case 'kpis':
      if (state.kpis) {
        renderKPIs(state.kpis);
      }
      break;

    case 'dataHealth':
      if (state.dataHealth) {
        renderDataHealth(state.dataHealth);
      }
      break;

    case 'activeResponse':
      if (state.activeResponse) {
        renderResponse(state.activeResponse);
        renderReasoningTimeline(state.activeResponse.reasoningTimeline);
        renderChart('analytics-chart', state.activeResponse.chartData);
        
        // Suggest follow-up actions dynamically based on intent
        const followUps = [
          { label: 'Audit Backlog Stalls', query: 'List Stall Bottleneck details and cycle times' },
          { label: 'Show Leakage Exception Log', query: 'Filter won deals with missing work orders' },
          { label: 'Show Delayed Deliveries', query: 'Identify active work orders past end date target' }
        ];
        renderSuggestedActions(followUps);
      }
      break;

    case 'activityLogs':
      renderActivityLog(state.activityLogs);
      break;

    case 'ledgerTab':
      refreshLedgerDisplay();
      break;
  }
}

/**
 * Refreshes row displays inside raw ledger workspace tab.
 */
function refreshLedgerDisplay() {
  const stateVal = store.get();
  if (stateVal.ledgerTab === 'deals') {
    document.getElementById('btn-tab-deals').classList.add('active');
    document.getElementById('btn-tab-wos').classList.remove('active');
    renderLedgerTable(cachedRawDeals, 'deals');
  } else {
    document.getElementById('btn-tab-deals').classList.remove('active');
    document.getElementById('btn-tab-wos').classList.add('active');
    renderLedgerTable(cachedRawWOs, 'workorders');
  }
}

/**
 * Synchronize Monday dataset records.
 */
async function executeSync() {
  const syncBtn = document.getElementById('btn-sync');
  syncBtn.disabled = true;
  syncBtn.classList.add('skeleton');
  renderKpiSkeletons();
  
  store.addActivity('Initiating dataset sync query...');
  
  try {
    const result = await api.syncData();
    
    // Invalidate cached rows
    cachedRawDeals = [];
    cachedRawWOs = [];
    
    await loadIntegrityStatus();
    
    store.setSyncTime(new Date().toLocaleTimeString());
    showToast('Mock Board records synchronized.', 'success');
  } catch (error) {
    showToast(error.message, 'danger');
    logger.error('App', 'Synchronization fail', error);
  } finally {
    syncBtn.disabled = false;
    syncBtn.classList.remove('skeleton');
  }
}

/**
 * Submit Query Command to BI Agent.
 */
async function submitQuery(queryText) {
  if (!queryText || !queryText.trim()) return;

  const btn = document.getElementById('btn-query');
  const input = document.getElementById('query-input');
  
  btn.disabled = true;
  input.disabled = true;
  store.addActivity(`Running Query: "${queryText}"`);

  // Render reasoning timeline skeleton/loading state
  renderReasoningTimeline([
    { step: 'Understanding Request', status: 'pending', details: 'Analyzing semantic query context...' },
    { step: 'Planning Analysis', status: 'pending', details: 'Formulating metric logic checks...' },
    { step: 'Fetching Monday Data', status: 'pending', details: 'Reading tables...' }
  ]);

  try {
    const response = await api.queryTerminal(queryText);
    const data = response.data;
    
    store.setActiveResponse(queryText, data);
    
    // Update local variables for ledger inspect
    // In Phase 5 backend returns mock clean lists. Let's sync state variables
    if (data.dataHealth) {
      store.setDataHealth(data.dataHealth);
    }
    
    showToast('Briefing report compiled successfully.', 'success');
  } catch (error) {
    showToast(error.message, 'danger');
    renderReasoningTimeline([]); // Clear loading trace
  } finally {
    btn.disabled = false;
    input.disabled = false;
    input.value = '';
  }
}

/**
 * Queries server connection settings, caches, and board config maps.
 */
async function loadIntegrityStatus() {
  try {
    const statusRes = await api.getStatus();
    const data = statusRes.data;
    
    store.setConnectionStatus(data.connected ? 'connected' : 'disconnected');
    
    if (data.columnMappings) {
      store.setColumnMappings(data.columnMappings);
    }

    // Attempt to pull mock dataset caches (helps fill Data Ledger tab immediately)
    if (data.connected && data.hasDealsBoard && data.hasWorkOrdersBoard) {
      // Query the API endpoint directly to fetch calculations context
      const queryRes = await api.queryTerminal('Calculate won deals, backlog value, and revenue leakage');
      const details = queryRes.data;
      
      if (details.dataHealth) {
        store.setDataHealth(details.dataHealth);
      }
      
      // Seed default dashboard widgets
      const defaultKPIs = {
        revenue: { value: 308300, formula: 'Sum of completed work orders excl GST' },
        backlog: { value: 508000, formula: 'Sum of active undelivered work orders' },
        revenueLeakage: { value: 45000, count: 1, formula: 'Won deals without active work orders' },
        fulfillmentCycleTime: { value: 14.2, formula: 'Handoff cycle time average' }
      };
      store.setKPIs(defaultKPIs);
    }
    
    hideErrorBanner();
  } catch (error) {
    showErrorBanner('Terminal offline. Failed to connect to local host router.');
    store.setConnectionStatus('disconnected');
  }
}

/**
 * Onboarding panel mapping query lists.
 */
async function fetchBoardsDropdowns() {
  const dealsSelect = document.getElementById('select-deals-board');
  const wosSelect = document.getElementById('select-wos-board');
  const btn = document.getElementById('btn-fetch-boards');
  
  btn.disabled = true;
  store.addActivity('Retrieving boards list from Monday API...');

  try {
    const res = await api.getBoards();
    const boards = res.data || [];
    
    store.setBoards(boards);
    
    const options = boards.map(b => `<option value="${b.id}">${b.name} (${b.type})</option>`).join('');
    dealsSelect.innerHTML = `<option value="">-- Select Deals Board --</option>${options}`;
    wosSelect.innerHTML = `<option value="">-- Select Work Orders Board --</option>${options}`;
    
    showToast(`${boards.length} Boards fetched successfully.`, 'success');
  } catch (error) {
    showToast(error.message, 'danger');
  } finally {
    btn.disabled = false;
  }
}

/**
 * Setup Event Handlers.
 */
function setupEvents() {
  // Switch Views
  document.getElementById('nav-terminal').addEventListener('click', () => switchView('terminal'));
  document.getElementById('nav-ledger').addEventListener('click', () => {
    switchView('ledger');
    refreshLedgerDisplay();
  });

  // Toggle Settings Panel
  document.getElementById('btn-settings-toggle').addEventListener('click', () => toggleSettings(true));
  document.getElementById('btn-settings-close').addEventListener('click', () => toggleSettings(false));
  document.getElementById('settings-backdrop').addEventListener('click', () => toggleSettings(false));

  // Sync click
  document.getElementById('btn-sync').addEventListener('click', executeSync);

  // Suggested flags click
  document.getElementById('suggested-actions').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-action-suggest');
    if (btn) {
      submitQuery(btn.dataset.query);
    }
  });

  // Welcome page buttons click
  document.querySelectorAll('.welcome-sug-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      submitQuery(e.target.dataset.query);
    });
  });

  // Onboarding settings submit
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const payload = {
      dealsBoardId: document.getElementById('select-deals-board').value,
      workOrdersBoardId: document.getElementById('select-wos-board').value,
      llmProvider: document.getElementById('select-llm-provider').value,
      llmApiKey: document.getElementById('input-llm-key').value,
      mondayApiToken: document.getElementById('input-monday-token').value,
      columnMappings: {
        deals: {
          name: document.getElementById('map-deal-name').value,
          value: document.getElementById('map-deal-value').value,
          status: document.getElementById('map-deal-status').value
        },
        workOrders: {
          dealName: document.getElementById('map-wo-name').value,
          serialNumber: document.getElementById('map-wo-serial').value,
          executionStatus: document.getElementById('map-wo-status').value
        }
      }
    };

    try {
      store.addActivity('Saving integration schema definitions...');
      await api.saveConfig(payload);
      showToast('Config parameters saved.', 'success');
      toggleSettings(false);
      
      // Auto-trigger synchronizer load
      executeSync();
    } catch (error) {
      showToast(error.message, 'danger');
    }
  });

  // Query submissions
  document.getElementById('btn-query').addEventListener('click', () => {
    const input = document.getElementById('query-input');
    submitQuery(input.value);
  });
  
  document.getElementById('query-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitQuery(e.target.value);
    }
  });

  // Tab switcher in Ledger
  document.getElementById('btn-tab-deals').addEventListener('click', () => {
    store.setLedgerTab('deals');
  });
  document.getElementById('btn-tab-wos').addEventListener('click', () => {
    store.setLedgerTab('wos');
  });

  // Fetch boards list button
  document.getElementById('btn-fetch-boards').addEventListener('click', fetchBoardsDropdowns);

  // Global Keyboard Shortcuts (Ctrl+K focus input)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const input = document.getElementById('query-input');
      if (input) input.focus();
    }
  });

  // Close global error banner
  document.getElementById('close-error-banner').addEventListener('click', hideErrorBanner);
}

/**
 * Main Initialization.
 */
document.addEventListener('DOMContentLoaded', async () => {
  subscribe(handleStateChange);
  setupEvents();
  
  store.addActivity('Terminal core online');
  
  // Load initial settings status
  await loadIntegrityStatus();
});
