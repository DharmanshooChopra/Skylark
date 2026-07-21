/**
 * Skylark Visual Analytics Engine & Chart Canvas Lifecycle Manager (Chart.js).
 */

let activeCharts = {};

/**
 * Safely destroys a specific chart instance by canvas ID to prevent memory leaks.
 */
export function destroyChart(canvasId) {
  if (activeCharts[canvasId]) {
    activeCharts[canvasId].destroy();
    delete activeCharts[canvasId];
  }
}

/**
 * Format numbers for Chart.js ticks (Cr / L / K).
 */
function formatChartTick(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const abs = Math.abs(val);
  if (abs >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
  return `₹${val}`;
}

/**
 * Renders or updates Chart.js canvas for dynamic AI queries.
 */
export function renderChart(canvasId, chartData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  destroyChart(canvasId);

  if (!chartData || !chartData.values || chartData.values.length === 0) {
    const card = canvas.closest('.card-glass');
    if (card) card.classList.add('hidden');
    return;
  }

  const card = canvas.closest('.card-glass');
  if (card) card.classList.remove('hidden');

  const ctx = canvas.getContext('2d');
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0F172A',
        borderColor: '#334155',
        borderWidth: 1,
        titleFont: { family: 'Inter', size: 12, weight: 'bold' },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 10,
        callbacks: {
          label: (context) => `${context.label}: ₹${Math.round(context.raw || 0).toLocaleString('en-IN')}`
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94A3B8', font: { family: 'Inter', size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94A3B8', font: { family: 'Inter', size: 10 }, callback: (v) => formatChartTick(v) }
      }
    }
  };

  activeCharts[canvasId] = new Chart(ctx, {
    type: chartData.type || 'bar',
    data: {
      labels: chartData.labels,
      datasets: [{
        label: 'Value',
        data: chartData.values,
        backgroundColor: [
          'rgba(16, 185, 129, 0.75)',
          'rgba(245, 158, 11, 0.75)',
          'rgba(239, 68, 68, 0.75)',
          'rgba(59, 130, 246, 0.75)',
          'rgba(168, 85, 247, 0.75)'
        ],
        borderRadius: 6
      }]
    },
    options
  });
}

/**
 * Populates the full Multi-Chart Analytics Canvas (Tab 2).
 */
export function renderAnalyticsCanvas(deals = [], workOrders = [], kpis = {}) {
  // Chart 1: Financial Performance Breakdown
  const ctxFinancials = document.getElementById('canvas-financials');
  if (ctxFinancials && kpis.revenue) {
    destroyChart('canvas-financials');
    activeCharts['canvas-financials'] = new Chart(ctxFinancials.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Completed Revenue', 'Active Backlog', 'Revenue Leakage Risk'],
        datasets: [{
          label: 'Amount (INR)',
          data: [kpis.revenue.value || 0, kpis.backlog.value || 0, kpis.revenueLeakage.value || 0],
          backgroundColor: [
            'rgba(16, 185, 129, 0.85)',
            'rgba(245, 158, 11, 0.85)',
            'rgba(239, 68, 68, 0.85)'
          ],
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Amount: ₹${Math.round(ctx.raw || 0).toLocaleString('en-IN')}`
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', callback: formatChartTick } }
        }
      }
    });
  }

  // Chart 2: Pipeline Stage Distribution
  const ctxPipeline = document.getElementById('canvas-pipeline');
  if (ctxPipeline && deals.length > 0) {
    destroyChart('canvas-pipeline');
    const stageCounts = {};
    deals.forEach(d => {
      const st = d.status || 'Open';
      stageCounts[st] = (stageCounts[st] || 0) + 1;
    });

    activeCharts['canvas-pipeline'] = new Chart(ctxPipeline.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(stageCounts),
        datasets: [{
          data: Object.values(stageCounts),
          backgroundColor: [
            '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'
          ],
          borderWidth: 2,
          borderColor: '#111827'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94A3B8', font: { family: 'Inter', size: 11 } } }
        }
      }
    });
  }

  // Chart 3: Sector Distribution
  const ctxSectors = document.getElementById('canvas-sectors');
  if (ctxSectors && deals.length > 0) {
    destroyChart('canvas-sectors');
    const sectorVals = {};
    deals.forEach(d => {
      const sec = d.sector || 'Unassigned';
      sectorVals[sec] = (sectorVals[sec] || 0) + (d.value || 0);
    });

    const sortedSectors = Object.entries(sectorVals).sort((a,b) => b[1] - a[1]).slice(0, 6);

    activeCharts['canvas-sectors'] = new Chart(ctxSectors.getContext('2d'), {
      type: 'bar',
      data: {
        labels: sortedSectors.map(s => s[0]),
        datasets: [{
          label: 'Sector Pipeline Value',
          data: sortedSectors.map(s => s[1]),
          backgroundColor: 'rgba(99, 102, 241, 0.85)',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `Value: ₹${Math.round(c.raw || 0).toLocaleString('en-IN')}` } }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', callback: formatChartTick } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } }
        }
      }
    });
  }

  // Chart 4: Execution Status Breakdown
  const ctxExecution = document.getElementById('canvas-execution');
  if (ctxExecution && workOrders.length > 0) {
    destroyChart('canvas-execution');
    const execCounts = {};
    workOrders.forEach(w => {
      const st = w.executionStatus || 'Not Started';
      execCounts[st] = (execCounts[st] || 0) + 1;
    });

    activeCharts['canvas-execution'] = new Chart(ctxExecution.getContext('2d'), {
      type: 'pie',
      data: {
        labels: Object.keys(execCounts),
        datasets: [{
          data: Object.values(execCounts),
          backgroundColor: [
            '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#06B6D4'
          ],
          borderWidth: 2,
          borderColor: '#111827'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94A3B8', font: { family: 'Inter', size: 11 } } }
        }
      }
    });
  }
}

/**
 * Downloads a chart canvas as PNG image.
 */
export function exportChartAsPNG(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const image = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
  const link = document.createElement('a');
  link.download = `${canvasId}_chart.png`;
  link.href = image;
  link.click();
}
