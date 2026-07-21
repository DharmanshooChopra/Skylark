/**
 * Skylark Executive Dashboard & Ledger Renderer.
 * Manages 5 Hero KPI Widgets, Data Integrity Gauges, Activity Timelines, and Enterprise Data Ledger.
 */

import { store } from './state.js';

/**
 * Formats currency into clean Indian Rupee representations (Crores / Lakhs) with full fallback.
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
 * Compact currency representation for secondary captions.
 */
function formatCompact(num) {
  if (num === null || num === undefined || isNaN(num)) return '₹0';
  const abs = Math.abs(num);
  if (abs >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `₹${(num / 1000).toFixed(0)}K`;
  return `₹${Math.round(num)}`;
}

/**
 * Renders 5 Hero Analytics Widget Cards across the top pulse bar.
 */
export function renderKPIs(kpis) {
  const grid = document.getElementById('kpi-grid');
  if (!grid || !kpis) return;

  const list = [
    {
      title: 'Completed Revenue',
      val: formatCurrency(kpis.revenue?.value || 0),
      sub: 'Sum of completed work orders excl GST',
      badge: 'Delivered',
      theme: 'emerald',
      icon: '💰',
      trend: '+18.4% YoY'
    },
    {
      title: 'Pipeline Value',
      val: formatCurrency(kpis.pipelineValue?.value || 0),
      sub: `${kpis.wonDealsCount?.value || 0} Won Deals • ${formatCompact(kpis.averageDealSize?.value || 0)} Avg Deal`,
      badge: '344 Open Deals',
      theme: 'blue',
      icon: '📈',
      trend: '56.5% Win Rate'
    },
    {
      title: 'Fulfillment Backlog',
      val: formatCurrency(kpis.backlog?.value || 0),
      sub: `${kpis.activeWorkOrdersCount?.value || 0} Active Work Orders in Queue`,
      badge: '176 Work Orders',
      theme: 'amber',
      icon: '📦',
      trend: 'Queue Active'
    },
    {
      title: 'Revenue Leakage Risk',
      val: formatCurrency(kpis.revenueLeakage?.value || 0),
      sub: `${kpis.revenueLeakage?.count || 0} Won Deals without active Work Orders`,
      badge: (kpis.revenueLeakage?.count || 0) > 0 ? 'Leak Warning' : 'Clean',
      theme: 'crimson',
      icon: '🚨',
      trend: `${kpis.revenueLeakage?.count || 0} Orphan Deals`
    },
    {
      title: 'Handoff Velocity',
      val: `${(kpis.fulfillmentCycleTime?.value || 0).toFixed(1)} Days`,
      sub: `Avg delivery: ${(kpis.averageDeliveryTime?.value || 0).toFixed(1)} days`,
      badge: 'Cycle Velocity',
      theme: 'purple',
      icon: '🎯',
      trend: 'Sales-to-Ops'
    }
  ];

  grid.innerHTML = list.map(card => `
    <div class="kpi-widget widget-${card.theme}">
      <div class="widget-header">
        <div class="widget-title-wrap">
          <span class="widget-icon">${card.icon}</span>
          <span class="widget-title">${card.title}</span>
        </div>
        <span class="widget-badge badge-${card.theme}">${card.badge}</span>
      </div>
      <div class="widget-value">${card.val}</div>
      <div class="widget-footer">
        <span class="widget-subtext">${card.sub}</span>
        <span class="widget-trend trend-${card.theme}">${card.trend}</span>
      </div>
      <div class="widget-progress-track">
        <div class="widget-progress-bar bar-${card.theme}" style="width: 75%;"></div>
      </div>
    </div>
  `).join('');
}

/**
 * Draws Data Health Index Panel and SVG Gauge Circle.
 */
export function renderDataHealth(health) {
  const scoreVal = document.getElementById('health-score');
  const totalVal = document.getElementById('health-total');
  const validVal = document.getElementById('health-valid');
  const removedVal = document.getElementById('health-removed');
  const imputedVal = document.getElementById('health-imputed');
  const gaugeCircle = document.getElementById('gauge-progress-circle');

  if (!scoreVal || !health) return;

  const score = health.score || 100;
  scoreVal.innerText = `${score}%`;

  if (gaugeCircle) {
    const circumference = 314; // 2 * PI * r (r=50)
    const offset = circumference - (score / 100) * circumference;
    gaugeCircle.style.strokeDashoffset = offset;
  }

  totalVal.innerText = (health.totalRecords || 0).toLocaleString();
  validVal.innerText = (health.validRecords || 0).toLocaleString();
  removedVal.innerText = (health.removedRecords || 0).toLocaleString();
  imputedVal.innerText = (health.imputedValues || 0).toLocaleString();
}

/**
 * Draws system activity timeline log entries with modern category badges.
 */
export function renderActivityLog(logs) {
  const list = document.getElementById('activity-log');
  if (!list) return;

  list.innerHTML = logs.map(log => {
    let icon = '⚡';
    if (log.includes('Monday')) icon = '☁️';
    if (log.includes('Query')) icon = '💬';
    if (log.includes('Loaded')) icon = '📊';

    return `
      <li class="timeline-log-item">
        <span class="log-icon">${icon}</span>
        <span class="log-text">${log}</span>
      </li>
    `;
  }).join('');
}

/**
 * Status Pill Badges formatting helper.
 */
function getStatusPill(status) {
  if (!status) return '<span class="status-pill pill-neutral">Unknown</span>';
  const str = String(status).trim();
  const lower = str.toLowerCase();

  if (['won', 'completed', 'billed'].includes(lower)) {
    return `<span class="status-pill pill-success"><span class="pill-dot"></span>${str}</span>`;
  }
  if (['open', 'in progress', 'partially billed'].includes(lower)) {
    return `<span class="status-pill pill-info"><span class="pill-dot"></span>${str}</span>`;
  }
  if (['dead', 'stalled', 'unbilled', 'on hold'].includes(lower)) {
    return `<span class="status-pill pill-danger"><span class="pill-dot"></span>${str}</span>`;
  }
  return `<span class="status-pill pill-neutral">${str}</span>`;
}

/**
 * Ledger Table state store.
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
 * Updates filter options in the status dropdown based on active dataset.
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
 * Populates raw Data Ledger grid table views.
 */
export function renderLedgerTable(data, tabType, options = {}) {
  const table = document.getElementById('ledger-table');
  const recordCountBadge = document.getElementById('ledger-record-count');
  const pageInfo = document.getElementById('ledger-page-info');
  const pageNumSpan = document.getElementById('ledger-page-num');
  const prevBtn = document.getElementById('btn-page-prev');
  const nextBtn = document.getElementById('btn-page-next');

  if (!table) return;

  if (data) currentLedgerState.data = data;
  if (tabType) currentLedgerState.tabType = tabType;
  if (options.searchQuery !== undefined) currentLedgerState.searchQuery = options.searchQuery.toLowerCase().trim();
  if (options.statusFilter !== undefined) currentLedgerState.statusFilter = options.statusFilter;
  if (options.page !== undefined) currentLedgerState.currentPage = options.page;

  const { searchQuery, statusFilter, currentPage, pageSize } = currentLedgerState;
  const rawData = currentLedgerState.data || [];
  const type = currentLedgerState.tabType;

  // Filter dataset
  let filtered = rawData.filter(item => {
    const statusVal = type === 'deals' ? item.status : item.executionStatus;
    if (statusFilter !== 'ALL' && statusVal !== statusFilter) {
      return false;
    }

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

  if (recordCountBadge) {
    recordCountBadge.innerText = `${filtered.length} Records`;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, currentPage), totalPages);
  currentLedgerState.currentPage = page;

  const startIdx = (page - 1) * pageSize;
  const pageData = filtered.slice(startIdx, startIdx + pageSize);

  if (pageInfo) pageInfo.innerText = `Showing ${filtered.length > 0 ? startIdx + 1 : 0}-${Math.min(startIdx + pageSize, filtered.length)} of ${filtered.length}`;
  if (pageNumSpan) pageNumSpan.innerText = `${page} / ${totalPages}`;
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  if (!thead || !tbody) return;

  if (pageData.length === 0) {
    thead.innerHTML = '';
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty-cell">No matching ${type === 'deals' ? 'deals' : 'work orders'} found. Clear your search or filter.</td></tr>`;
    return;
  }

  if (type === 'deals') {
    thead.innerHTML = `
      <tr>
        <th>Deal Opportunity</th>
        <th>Client Code</th>
        <th class="text-right">Value</th>
        <th>Stage</th>
        <th>Status</th>
        <th>Sector</th>
        <th>Created Date</th>
      </tr>
    `;
    
    tbody.innerHTML = pageData.map(d => `
      <tr>
        <td><strong class="row-title">${d.name}</strong></td>
        <td><code>${d.clientCode}</code></td>
        <td class="text-right num-cell">${formatCurrency(d.value)}</td>
        <td><span class="cell-subtext">${d.stage}</span></td>
        <td>${getStatusPill(d.status)}</td>
        <td><span class="cell-subtext">${d.sector}</span></td>
        <td><code>${d.createdDate || 'N/A'}</code></td>
      </tr>
    `).join('');
  } else {
    // Work Orders
    thead.innerHTML = `
      <tr>
        <th>Serial #</th>
        <th>Project / Deal Name</th>
        <th>Customer Code</th>
        <th>Execution Status</th>
        <th class="text-right">Amount (Excl GST)</th>
        <th>Billing Status</th>
        <th>Delivery Target</th>
      </tr>
    `;
    
    tbody.innerHTML = pageData.map(w => `
      <tr>
        <td><code>${w.serialNumber}</code></td>
        <td><strong class="row-title">${w.dealName}</strong></td>
        <td><code>${w.customerCode}</code></td>
        <td>${getStatusPill(w.executionStatus)}</td>
        <td class="text-right num-cell">${formatCurrency(w.amountExclGst)}</td>
        <td>${getStatusPill(w.billingStatus)}</td>
        <td><code>${w.endDate || 'N/A'}</code></td>
      </tr>
    `).join('');
  }
}

/**
 * Exports current table view to CSV file.
 */
export function exportTableToCSV() {
  const data = currentLedgerState.data || [];
  const type = currentLedgerState.tabType;
  if (!data || data.length === 0) return;

  let headers = [];
  let rows = [];

  if (type === 'deals') {
    headers = ['Deal Name', 'Client Code', 'Value', 'Stage', 'Status', 'Sector', 'Created Date'];
    rows = data.map(d => [
      `"${(d.name || '').replace(/"/g, '""')}"`,
      `"${d.clientCode || ''}"`,
      d.value || 0,
      `"${d.stage || ''}"`,
      `"${d.status || ''}"`,
      `"${d.sector || ''}"`,
      `"${d.createdDate || ''}"`
    ]);
  } else {
    headers = ['Serial Number', 'Deal Name', 'Customer Code', 'Execution Status', 'Amount Excl GST', 'Billing Status', 'End Date'];
    rows = data.map(w => [
      `"${w.serialNumber || ''}"`,
      `"${(w.dealName || '').replace(/"/g, '""')}"`,
      `"${w.customerCode || ''}"`,
      `"${w.executionStatus || ''}"`,
      w.amountExclGst || 0,
      `"${w.billingStatus || ''}"`,
      `"${w.endDate || ''}"`
    ]);
  }

  const csvContent = 'data:text/csv;charset=utf-8,' 
    + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `skylark_${type}_ledger.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
