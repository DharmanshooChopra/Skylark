/**
 * Skylark Application Orchestrator.
 * Handles state transitions, tab navigation, query submissions, and rendering dispatch.
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
  renderLedgerTable,
  updateLedgerFilters,
  exportTableToCSV
} from './dashboard.js';
import { 
  renderResponse, 
  renderReasoningTimeline, 
  renderSuggestedActions,
  copyBriefToClipboard
} from './chat.js';
import { 
  renderChart, 
  renderAnalyticsCanvas, 
  exportChartAsPNG 
} from './charts.js';

let cachedRawDeals = [];
let cachedRawWOs = [];
let ledgerPage = 1;

/**
 * Reactive State Dispatch Handler.
 */
function handleStateChange(state, prop) {
  switch (prop) {
    case 'connectionStatus':
      const badge = document.getElementById('connection-badge');
      const text = badge.querySelector('.pill-text');
      if (state.connectionStatus === 'connected') {
        badge.className = 'status-pill pill-online';
        text.innerText = 'MONDAY LIVE';
      } else {
        badge.className = 'status-pill pill-danger';
        text.innerText = 'OFFLINE';
      }
      break;

    case 'syncTime':
      const syncEl = document.getElementById('sync-time');
      if (syncEl) syncEl.innerText = state.syncTime;
      break;

    case 'kpis':
      if (state.kpis) {
        renderKPIs(state.kpis);
        renderAnalyticsCanvas(cachedRawDeals, cachedRawWOs, state.kpis);
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
        
        const followUps = [
          { label: '📊 Revenue & Leakage Overview', query: 'Calculate won deals, backlog value, and revenue leakage' },
          { label: '🚨 Stalled Backlog Audit', query: 'List Stall Bottleneck details and cycle times' },
          { label: '⏱ Handoff Velocity Audit', query: 'What is the average sales-to-operations handoff cycle time?' }
        ];
        renderSuggestedActions(followUps);
      }
      break;

    case 'activityLogs':
      renderActivityLog(state.activityLogs);
      break;

    case 'ledgerTab':
      ledgerPage = 1;
      const searchInput = document.getElementById('ledger-search');
      const filterSelect = document.getElementById('ledger-filter-status');
      if (searchInput) searchInput.value = '';
      if (filterSelect) filterSelect.value = 'ALL';
      refreshLedgerDisplay();
      break;
  }
}

/**
 * Refreshes row displays inside raw ledger workspace tab.
 */
function refreshLedgerDisplay() {
  const stateVal = store.get();
  const searchInput = document.getElementById('ledger-search');
  const filterSelect = document.getElementById('ledger-filter-status');

  const searchQuery = searchInput ? searchInput.value : '';
  const statusFilter = filterSelect ? filterSelect.value : 'ALL';

  if (stateVal.ledgerTab === 'deals') {
    const bDeals = document.getElementById('btn-tab-deals');
    const bWos = document.getElementById('btn-tab-wos');
    if (bDeals) bDeals.classList.add('active');
    if (bWos) bWos.classList.remove('active');
    updateLedgerFilters(cachedRawDeals, 'deals');
    renderLedgerTable(cachedRawDeals, 'deals', { searchQuery, statusFilter, page: ledgerPage });
  } else {
    const bDeals = document.getElementById('btn-tab-deals');
    const bWos = document.getElementById('btn-tab-wos');
    if (bDeals) bDeals.classList.remove('active');
    if (bWos) bWos.classList.add('active');
    updateLedgerFilters(cachedRawWOs, 'workorders');
    renderLedgerTable(cachedRawWOs, 'workorders', { searchQuery, statusFilter, page: ledgerPage });
  }
}

/**
 * Synchronize Monday dataset records.
 */
async function executeSync() {
  const syncBtn = document.getElementById('btn-sync');
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.classList.add('skeleton');
  }
  renderKpiSkeletons();
  
  store.addActivity('Initiating live Monday.com dataset sync...');
  
  try {
    await api.syncData();
    await loadDashboard();
    await loadIntegrityStatus();
    
    store.setSyncTime(new Date().toLocaleTimeString());
    showToast('Live Monday.com datasets synchronized.', 'success');
  } catch (error) {
    showToast(error.message, 'danger');
    console.error('Synchronization failed:', error);
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.classList.remove('skeleton');
    }
  }
}

/**
 * Submit Query Command to BI Agent.
 */
async function submitQuery(queryText) {
  if (!queryText || !queryText.trim()) return;

  const btn = document.getElementById('btn-query');
  const input = document.getElementById('query-input');
  
  if (btn) btn.disabled = true;
  if (input) input.disabled = true;
  store.addActivity(`Running Query: "${queryText}"`);

  renderReasoningTimeline([
    { step: 'Understanding Query', status: 'pending', details: 'Parsing intent & filtering rules...' },
    { step: 'Planning Analysis', status: 'pending', details: 'Formulating metric logic checks...' },
    { step: 'Fetching Monday Data', status: 'pending', details: 'Reading canonical tables...' }
  ]);

  try {
    const response = await api.queryTerminal(queryText);
    const data = response.data;
    
    store.setActiveResponse(queryText, data);
    
    if (data.dataHealth) {
      store.setDataHealth(data.dataHealth);
    }
    
    showToast('Briefing report compiled successfully.', 'success');
  } catch (error) {
    showToast(error.message, 'danger');
    renderReasoningTimeline([]);
  } finally {
    if (btn) btn.disabled = false;
    if (input) {
      input.disabled = false;
      input.value = '';
    }
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

    hideErrorBanner();
  } catch (error) {
    showErrorBanner('Terminal offline. Failed to connect to local host router.');
    store.setConnectionStatus('disconnected');
  }
}

/**
 * Loads live KPI dashboard data from the /api/dashboard endpoint.
 */
async function loadDashboard() {
  try {
    store.addActivity('Loading live analytics from Monday.com...');
    const res = await api.getDashboard();
    const data = res.data;

    if (data.deals) cachedRawDeals = data.deals;
    if (data.workOrders) cachedRawWOs = data.workOrders;

    if (data.kpis) {
      store.setKPIs(data.kpis);
      renderAnalyticsCanvas(cachedRawDeals, cachedRawWOs, data.kpis);
    }
    if (data.dataHealth) {
      store.setDataHealth(data.dataHealth);
    }
    store.setSyncTime(new Date().toLocaleTimeString());
    store.addActivity(`Loaded: ${data.recordCounts?.deals || 0} deals, ${data.recordCounts?.workOrders || 0} work orders`);
    refreshLedgerDisplay();
  } catch (error) {
    showErrorBanner(`Failed to load dashboard data: ${error.message}`);
    console.error('Dashboard load failed:', error);
  }
}

/**
 * Onboarding panel mapping query lists.
 */
async function fetchBoardsDropdowns() {
  const dealsSelect = document.getElementById('select-deals-board');
  const wosSelect = document.getElementById('select-wos-board');
  const btn = document.getElementById('btn-fetch-boards');
  
  if (btn) btn.disabled = true;
  store.addActivity('Retrieving boards list from Monday API...');

  try {
    const res = await api.getBoards();
    const boards = res.data || [];
    
    store.setBoards(boards);
    
    const options = boards.map(b => `<option value="${b.id}">${b.name} (${b.type})</option>`).join('');
    if (dealsSelect) dealsSelect.innerHTML = `<option value="">-- Select Deals Board --</option>${options}`;
    if (wosSelect) wosSelect.innerHTML = `<option value="">-- Select Work Orders Board --</option>${options}`;
    
    showToast(`${boards.length} Boards fetched successfully.`, 'success');
  } catch (error) {
    showToast(error.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Setup Event Handlers.
 */
function setupEvents() {
  // Navigation section tabs
  const nTerm = document.getElementById('nav-terminal');
  const nAnaly = document.getElementById('nav-analytics');
  const nInteg = document.getElementById('nav-integrity');
  const nLedg = document.getElementById('nav-ledger');

  if (nTerm) nTerm.addEventListener('click', () => switchView('terminal'));
  if (nAnaly) nAnaly.addEventListener('click', () => {
    switchView('analytics');
    renderAnalyticsCanvas(cachedRawDeals, cachedRawWOs, store.get().kpis || {});
  });
  if (nInteg) nInteg.addEventListener('click', () => switchView('integrity'));
  if (nLedg) nLedg.addEventListener('click', () => {
    switchView('ledger');
    refreshLedgerDisplay();
  });

  // Settings Panel Toggle
  const bSetToggle = document.getElementById('btn-settings-toggle');
  const bSetClose = document.getElementById('btn-settings-close');
  const bSetBack = document.getElementById('settings-backdrop');

  if (bSetToggle) bSetToggle.addEventListener('click', () => toggleSettings(true));
  if (bSetClose) bSetClose.addEventListener('click', () => toggleSettings(false));
  if (bSetBack) bSetBack.addEventListener('click', () => toggleSettings(false));

  // Sync click
  const bSync = document.getElementById('btn-sync');
  if (bSync) bSync.addEventListener('click', executeSync);

  // Copy brief button
  const bCopy = document.getElementById('btn-copy-brief');
  if (bCopy) bCopy.addEventListener('click', copyBriefToClipboard);

  // Export CSV button
  const bExportCsv = document.getElementById('btn-export-csv');
  if (bExportCsv) bExportCsv.addEventListener('click', exportTableToCSV);

  // Export Chart PNG buttons
  document.querySelectorAll('.export-chart-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const chartId = e.target.dataset.chart;
      if (chartId) exportChartAsPNG(chartId);
    });
  });

  // Suggested flags click
  const sugActions = document.getElementById('suggested-actions');
  if (sugActions) {
    sugActions.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-action-suggest');
      if (btn) submitQuery(btn.dataset.query);
    });
  }

  // Welcome prompt buttons click
  document.querySelectorAll('.prompt-card-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.prompt-card-btn');
      if (card) submitQuery(card.dataset.query);
    });
  });

  // Onboarding settings form submit
  const setForm = document.getElementById('settings-form');
  if (setForm) {
    setForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const payload = {
        dealsBoardId: document.getElementById('select-deals-board')?.value,
        workOrdersBoardId: document.getElementById('select-wos-board')?.value,
        llmProvider: document.getElementById('select-llm-provider')?.value,
        llmApiKey: document.getElementById('input-llm-key')?.value,
        mondayApiToken: document.getElementById('input-monday-token')?.value,
        columnMappings: {
          deals: {
            name: document.getElementById('map-deal-name')?.value,
            value: document.getElementById('map-deal-value')?.value,
            status: document.getElementById('map-deal-status')?.value
          },
          workOrders: {
            dealName: document.getElementById('map-wo-name')?.value,
            serialNumber: document.getElementById('map-wo-serial')?.value,
            executionStatus: document.getElementById('map-wo-status')?.value
          }
        }
      };

      try {
        store.addActivity('Saving integration configuration definitions...');
        await api.saveConfig(payload);
        showToast('Settings parameters saved.', 'success');
        toggleSettings(false);
        executeSync();
      } catch (error) {
        showToast(error.message, 'danger');
      }
    });
  }

  // Query submissions
  const bQuery = document.getElementById('btn-query');
  const qInput = document.getElementById('query-input');

  if (bQuery) bQuery.addEventListener('click', () => submitQuery(qInput?.value));
  if (qInput) {
    qInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitQuery(e.target.value);
    });
  }

  // Tab switcher in Ledger
  const bTabDeals = document.getElementById('btn-tab-deals');
  const bTabWos = document.getElementById('btn-tab-wos');

  if (bTabDeals) bTabDeals.addEventListener('click', () => store.setLedgerTab('deals'));
  if (bTabWos) bTabWos.addEventListener('click', () => store.setLedgerTab('wos'));

  // Ledger Search & Filter
  const ledgerSearch = document.getElementById('ledger-search');
  if (ledgerSearch) {
    ledgerSearch.addEventListener('input', () => {
      ledgerPage = 1;
      refreshLedgerDisplay();
    });
  }

  const ledgerFilter = document.getElementById('ledger-filter-status');
  if (ledgerFilter) {
    ledgerFilter.addEventListener('change', () => {
      ledgerPage = 1;
      refreshLedgerDisplay();
    });
  }

  // Ledger Pagination
  const btnPrev = document.getElementById('btn-page-prev');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (ledgerPage > 1) {
        ledgerPage--;
        refreshLedgerDisplay();
      }
    });
  }

  const btnNext = document.getElementById('btn-page-next');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      ledgerPage++;
      refreshLedgerDisplay();
    });
  }

  // Fetch boards list button
  const bFetchB = document.getElementById('btn-fetch-boards');
  if (bFetchB) bFetchB.addEventListener('click', fetchBoardsDropdowns);

  // Global Keyboard Shortcuts (Ctrl+K focus query input)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (qInput) qInput.focus();
    }
  });

  // Close global error banner
  const bCloseErr = document.getElementById('close-error-banner');
  if (bCloseErr) bCloseErr.addEventListener('click', hideErrorBanner);
}

/**
 * Main Initialization.
 */
document.addEventListener('DOMContentLoaded', async () => {
  subscribe(handleStateChange);
  setupEvents();
  
  store.addActivity('Skylark Executive Command Terminal online');
  
  await loadIntegrityStatus();
  await loadDashboard();
});
