/**
 * Dashboard Renderer.
 * Draws Executive KPIs, Data Health gauges, Activity logs, and normalized Data Ledger tables.
 */

import { store } from './state.js';

/**
 * Formats a currency value with both readable Compact Notation (Crores / Millions)
 * and formatted full digits.
 * 
 * @param {number} num 
 * @returns {string} Formatted string
 */
function formatCurrency(num) {
  if (num === null || num === undefined || isNaN(num)) return '₹0';

  const abs = Math.abs(num);
  let compact = '';

  if (abs >= 10000007) { // 1 Crore = 10,000,000
    compact = ` (₹${(num / 10000000).toFixed(2)} Cr)`;
  } else if (abs >= 100000) { // 1 Lakh = 100,000
    compact = ` (₹${(num / 100000).toFixed(2)} L)`;
  }

  return `₹${Math.round(num).toLocaleString('en-IN')}${compact}`;
}

/**
 * Renders the Executive KPI pulse grid (6 Cards).
 */
export function renderKPIs(kpis) {
  const grid = document.getElementById('kpi-grid');
  if (!grid || !kpis) return;

  const list = [
    {
      title: 'Completed Revenue',
      val: formatCurrency(kpis.revenue?.value || 0),
      sub: kpis.revenue?.formula || 'Sum of completed work orders excl GST',
      tag: 'Completed',
      class: 'up'
    },
    {
      title: 'Pipeline Value',
      val: formatCurrency(kpis.pipelineValue?.value || 0),
      sub: kpis.pipelineValue?.formula || 'Sum of active open deals',
      tag: 'Open Deals',
      class: 'up'
    },
    {
      title: 'Fulfillment Backlog',
      val: formatCurrency(kpis.backlog?.value || 0),
      sub: kpis.backlog?.formula || 'Sum of active uncompleted work orders',
      tag: 'In Progress',
      class: (kpis.backlog?.value || 0) > (kpis.revenue?.value || 0) * 0.5 ? 'down' : 'up'
    },
    {
      title: 'Win Rate',
      val: `${(kpis.winRate?.value || 0).toFixed(1)}%`,
      sub: `${kpis.wonDealsCount?.value || 0} Won Deals out of total closed`,
      tag: 'Sales Conversion',
      class: (kpis.winRate?.value || 0) >= 50 ? 'up' : 'down'
    },
    {
      title: 'Revenue Leakage',
      val: formatCurrency(kpis.revenueLeakage?.value || 0),
      sub: `${kpis.revenueLeakage?.count || 0} Won Deals without active Work Orders`,
      tag: `${kpis.revenueLeakage?.count || 0} Orphan Deals`,
      class: (kpis.revenueLeakage?.count || 0) > 0 ? 'down' : 'up'
    },
    {
      title: 'Handoff Velocity',
      val: `${(kpis.fulfillmentCycleTime?.value || 0).toFixed(1)} Days`,
      sub: kpis.fulfillmentCycleTime?.formula || 'Deal close date to project start date',
      tag: 'Lead-to-Op Cycle',
      class: ''
    }
  ];

  grid.innerHTML = list.map(card => `
    <div class="kpi-card">
      <div class="kpi-header-row">
        <span class="kpi-title">${card.title}</span>
        ${card.tag ? `<span class="kpi-tag ${card.class}">${card.tag}</span>` : ''}
      </div>
      <div class="kpi-val">${card.val}</div>
      <div class="kpi-sub ${card.class}">${card.sub}</div>
    </div>
  `).join('');
}

/**
 * Draws Data Health index panel.
 */
export function renderDataHealth(health) {
  const scoreVal = document.getElementById('health-score');
  const totalVal = document.getElementById('health-total');
  const validVal = document.getElementById('health-valid');
  const removedVal = document.getElementById('health-removed');
  const imputedVal = document.getElementById('health-imputed');
  const warningsContainer = document.getElementById('health-warnings');
  const warningsList = document.getElementById('warnings-list');

  if (!scoreVal || !health) return;

  scoreVal.innerText = `${health.score || 100}%`;
  
  // Dynamic color coding
  if (health.score >= 90) {
    scoreVal.style.color = '#22C55E'; // Success
  } else if (health.score >= 70) {
    scoreVal.style.color = '#F59E0B'; // Warning
  } else {
    scoreVal.style.color = '#EF4444'; // Danger
  }

  totalVal.innerText = (health.totalRecords || 0).toLocaleString();
  validVal.innerText = (health.validRecords || 0).toLocaleString();
  removedVal.innerText = (health.removedRecords || 0).toLocaleString();
  imputedVal.innerText = (health.imputedValues || 0).toLocaleString();

  // Render warnings list
  if (health.warnings && health.warnings.length > 0) {
    warningsContainer.classList.remove('hidden');
    warningsList.innerHTML = health.warnings.map(w => `
      <li>[Row ${w.row !== undefined ? w.row : 'Sys'}] ${w.msg || w}</li>
    `).join('');
  } else {
    warningsContainer.classList.add('hidden');
  }
}

/**
 * Draws system activity log entries.
 */
export function renderActivityLog(logs) {
  const list = document.getElementById('activity-log');
  if (!list) return;

  list.innerHTML = logs.map(log => `<li>${log}</li>`).join('');
}

/**
 * Helper to generate status badge pill HTML.
 */
function getStatusBadge(status) {
  if (!status) return '<span class="status-pill status-neutral">Unknown</span>';
  const str = String(status).trim();
  const lower = str.toLowerCase();

  if (['won', 'completed', 'billed'].includes(lower)) {
    return `<span class="status-pill status-success"><span class="badge-dot"></span>${str}</span>`;
  }
  if (['open', 'in progress', 'partially billed'].includes(lower)) {
    return `<span class="status-pill status-info"><span class="badge-dot"></span>${str}</span>`;
  }
  if (['dead', 'stalled', 'unbilled', 'on hold'].includes(lower)) {
    return `<span class="status-pill status-danger"><span class="badge-dot"></span>${str}</span>`;
  }
  return `<span class="status-pill status-neutral">${str}</span>`;
}

/**
 * Ledger Table state store for searching, filtering, and pagination.
 */
let currentLedgerState = {
  data: [],
  tabType: 'deals',
  searchQuery: '',
  statusFilter: 'ALL',
  currentPage: 1,
  pageSize: 50
};

/**
 * Updates filter options in the status dropdown based on the active dataset.
 */
export function updateLedgerFilters(data, tabType) {
  const select = document.getElementById('ledger-filter-status');
  if (!select || !data) return;

  const statuses = new Set();
  data.forEach(item => {
    const status = tabType === 'deals' ? item.status : item.executionStatus;
    if (status) statuses.add(status);
  });

  const options = ['<option value="ALL">All Statuses</option>'];
  Array.from(statuses).sort().forEach(st => {
    options.push(`<option value="${st}">${st}</option>`);
  });

  select.innerHTML = options.join('');
}

/**
 * Populates raw Data Ledger grid table views with search, filtering, and pagination.
 */
export function renderLedgerTable(data, tabType, options = {}) {
  const table = document.getElementById('ledger-table');
  const recordCountBadge = document.getElementById('ledger-record-count');
  const pageInfo = document.getElementById('ledger-page-info');
  const pageNumSpan = document.getElementById('ledger-page-num');
  const prevBtn = document.getElementById('btn-page-prev');
  const nextBtn = document.getElementById('btn-page-next');

  if (!table) return;

  // Update current state parameters
  if (data) currentLedgerState.data = data;
  if (tabType) currentLedgerState.tabType = tabType;
  if (options.searchQuery !== undefined) currentLedgerState.searchQuery = options.searchQuery.toLowerCase().trim();
  if (options.statusFilter !== undefined) currentLedgerState.statusFilter = options.statusFilter;
  if (options.page !== undefined) currentLedgerState.currentPage = options.page;

  const { searchQuery, statusFilter, currentPage, pageSize } = currentLedgerState;
  const rawData = currentLedgerState.data || [];
  const type = currentLedgerState.tabType;

  // 1. Filter dataset
  let filtered = rawData.filter(item => {
    // Status filter
    const statusVal = type === 'deals' ? item.status : item.executionStatus;
    if (statusFilter !== 'ALL' && statusVal !== statusFilter) {
      return false;
    }

    // Search query filter
    if (searchQuery) {
      if (type === 'deals') {
        const nameMatch = (item.name || '').toLowerCase().includes(searchQuery);
        const clientMatch = (item.clientCode || '').toLowerCase().includes(searchQuery);
        const sectorMatch = (item.sector || '').toLowerCase().includes(searchQuery);
        const ownerMatch = (item.ownerCode || '').toLowerCase().includes(searchQuery);
        return nameMatch || clientMatch || sectorMatch || ownerMatch;
      } else {
        const dealMatch = (item.dealName || '').toLowerCase().includes(searchQuery);
        const serialMatch = (item.serialNumber || '').toLowerCase().includes(searchQuery);
        const custMatch = (item.customerCode || '').toLowerCase().includes(searchQuery);
        const sectorMatch = (item.sector || '').toLowerCase().includes(searchQuery);
        return dealMatch || serialMatch || custMatch || sectorMatch;
      }
    }

    return true;
  });

  // 2. Update record count badge
  if (recordCountBadge) {
    recordCountBadge.innerText = `${filtered.length} Records (${rawData.length} Total)`;
  }

  // 3. Paginate
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, currentPage), totalPages);
  currentLedgerState.currentPage = page;

  const startIdx = (page - 1) * pageSize;
  const pageData = filtered.slice(startIdx, startIdx + pageSize);

  // Update pagination UI controls
  if (pageInfo) pageInfo.innerText = `Showing ${filtered.length > 0 ? startIdx + 1 : 0}-${Math.min(startIdx + pageSize, filtered.length)} of ${filtered.length}`;
  if (pageNumSpan) pageNumSpan.innerText = `${page} / ${totalPages}`;
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  if (!thead || !tbody) return;

  if (pageData.length === 0) {
    thead.innerHTML = '';
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty-cell">No matching ${type === 'deals' ? 'deals' : 'work orders'} found. Try clearing your search filter.</td></tr>`;
    return;
  }

  if (type === 'deals') {
    thead.innerHTML = `
      <tr>
        <th>Deal Opportunity</th>
        <th>Client Code</th>
        <th>Value</th>
        <th>Stage</th>
        <th>Status</th>
        <th>Sector</th>
        <th>Created Date</th>
      </tr>
    `;
    
    tbody.innerHTML = pageData.map(d => `
      <tr>
        <td><strong>${d.name}</strong></td>
        <td><code>${d.clientCode}</code></td>
        <td class="text-right num-cell">${formatCurrency(d.value)}</td>
        <td><span class="cell-tag">${d.stage}</span></td>
        <td>${getStatusBadge(d.status)}</td>
        <td>${d.sector}</td>
        <td><code>${d.createdDate || 'N/A'}</code></td>
      </tr>
    `).join('');
  } else {
    // Work Orders
    thead.innerHTML = `
      <tr>
        <th>Serial #</th>
        <th>Deal / Project Name</th>
        <th>Customer Code</th>
        <th>Execution Status</th>
        <th>Amount (Excl GST)</th>
        <th>Billing Status</th>
        <th>Delivery Target</th>
      </tr>
    `;
    
    tbody.innerHTML = pageData.map(w => `
      <tr>
        <td><code>${w.serialNumber}</code></td>
        <td><strong>${w.dealName}</strong></td>
        <td><code>${w.customerCode}</code></td>
        <td>${getStatusBadge(w.executionStatus)}</td>
        <td class="text-right num-cell">${formatCurrency(w.amountExclGst)}</td>
        <td>${getStatusBadge(w.billingStatus)}</td>
        <td><code>${w.endDate || 'N/A'}</code></td>
      </tr>
    `).join('');
  }
}
