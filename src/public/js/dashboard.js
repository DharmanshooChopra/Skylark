/**
 * Dashboard Renderer.
 * Draws KPIs, Data Health gauges, Activity logs, and normalized Data Ledger tables.
 */

import { store } from './state.js';

/**
 * Renders the Executive KPI pulse grid with actual calculated values.
 */
export function renderKPIs(kpis) {
  const grid = document.getElementById('kpi-grid');
  if (!grid || !kpis) return;

  const list = [
    {
      title: 'Completed Revenue',
      val: `$${(kpis.revenue.value || 0).toLocaleString()}`,
      sub: kpis.revenue.formula,
      class: 'up'
    },
    {
      title: 'Fulfillment Backlog',
      val: `$${(kpis.backlog.value || 0).toLocaleString()}`,
      sub: kpis.backlog.formula,
      class: 'down'
    },
    {
      title: 'Revenue Leakage',
      val: `$${(kpis.revenueLeakage.value || 0).toLocaleString()}`,
      sub: `${kpis.revenueLeakage.count} orphan deals won without operational work orders`,
      class: kpis.revenueLeakage.count > 0 ? 'down' : 'up'
    },
    {
      title: 'Handoff Velocity',
      val: `${(kpis.fulfillmentCycleTime.value || 0).toFixed(1)} Days`,
      sub: kpis.fulfillmentCycleTime.formula,
      class: ''
    }
  ];

  grid.innerHTML = list.map(card => `
    <div class="kpi-card">
      <div class="kpi-title">${card.title}</div>
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

  totalVal.innerText = health.totalRecords || 0;
  validVal.innerText = health.validRecords || 0;
  removedVal.innerText = health.removedRecords || 0;
  imputedVal.innerText = health.imputedValues || 0;

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
 * Populates raw Data Ledger grid table views.
 */
export function renderLedgerTable(data, tabType) {
  const table = document.getElementById('ledger-table');
  if (!table) return;

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  
  if (!thead || !tbody) return;

  if (!data || data.length === 0) {
    thead.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px;">No data synced. Click Refresh or config mapping first.</td></tr>';
    return;
  }

  if (tabType === 'deals') {
    thead.innerHTML = `
      <tr>
        <th>Deal Name</th>
        <th>Client Code</th>
        <th>Value</th>
        <th>Stage</th>
        <th>Status</th>
        <th>Created Date</th>
      </tr>
    `;
    
    tbody.innerHTML = data.map(d => `
      <tr>
        <td><strong>${d.name}</strong></td>
        <td><code>${d.clientCode}</code></td>
        <td>$${(d.value || 0).toLocaleString()}</td>
        <td>${d.stage}</td>
        <td><span class="connection-badge ${d.status === 'Won' ? 'online' : 'offline'}">${d.status}</span></td>
        <td><code>${d.createdDate}</code></td>
      </tr>
    `).join('');
  } else {
    // Work Orders
    thead.innerHTML = `
      <tr>
        <th>Serial #</th>
        <th>Deal Name</th>
        <th>Customer Code</th>
        <th>Execution Status</th>
        <th>Amount (Excl GST)</th>
        <th>Delivery Target</th>
      </tr>
    `;
    
    tbody.innerHTML = data.map(w => `
      <tr>
        <td><code>${w.serialNumber}</code></td>
        <td><strong>${w.dealName}</strong></td>
        <td><code>${w.customerCode}</code></td>
        <td><span class="connection-badge ${w.executionStatus === 'Completed' ? 'online' : 'offline'}">${w.executionStatus}</span></td>
        <td>$${(w.amountExclGst || 0).toLocaleString()}</td>
        <td><code>${w.endDate || 'N/A'}</code></td>
      </tr>
    `).join('');
  }
}
