/**
 * Chart Lifecycle Manager using Chart.js.
 * Dynamically draws and updates executive visual canvases.
 */

let chartInstance = null;

/**
 * Destroys current active chart instance to prevent canvas memory leaks.
 */
export function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

/**
 * Format axis and tooltip numbers cleanly (Cr / L / M / K).
 */
function formatChartValue(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const abs = Math.abs(val);
  if (abs >= 10000000) { // 1 Crore = 10M
    return `₹${(val / 10000000).toFixed(1)}Cr`;
  }
  if (abs >= 100000) { // 1 Lakh = 100K
    return `₹${(val / 100000).toFixed(1)}L`;
  }
  if (abs >= 1000) {
    return `₹${(val / 1000).toFixed(0)}K`;
  }
  return `₹${val}`;
}

/**
 * Renders or updates Chart.js canvas with dynamic visual configurations.
 * 
 * @param {string} canvasId 
 * @param {Object} chartData { type, labels, values }
 */
export function renderChart(canvasId, chartData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // 1. Reset any old chart instance
  destroyChart();

  if (!chartData || !chartData.values || chartData.values.length === 0) {
    const card = canvas.closest('.chart-card');
    if (card) {
      card.classList.add('hidden');
    }
    return;
  }

  // Ensure card is visible
  const card = canvas.closest('.chart-card');
  if (card) {
    card.classList.remove('hidden');
  }

  const ctx = canvas.getContext('2d');
  
  // Custom dark mode theme configurations
  const textSecondary = '#94A3B8';
  const gridBorder = '#1F293D';
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: '#1E293B',
        borderColor: '#334155',
        borderWidth: 1,
        titleFont: { family: 'Inter', size: 12, weight: 'bold' },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 10,
        displayColors: false,
        callbacks: {
          label: (context) => {
            const rawVal = context.raw || 0;
            return `${context.label}: ₹${Math.round(rawVal).toLocaleString('en-IN')}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: gridBorder,
          borderColor: gridBorder
        },
        ticks: {
          color: textSecondary,
          font: { family: 'Inter', size: 10 }
        }
      },
      y: {
        grid: {
          color: gridBorder,
          borderColor: gridBorder
        },
        ticks: {
          color: textSecondary,
          font: { family: 'Inter', size: 10 },
          callback: (value) => formatChartValue(value)
        }
      }
    }
  };

  chartInstance = new Chart(ctx, {
    type: chartData.type || 'bar',
    data: {
      labels: chartData.labels,
      datasets: [{
        label: 'Metric Value',
        data: chartData.values,
        backgroundColor: [
          'rgba(59, 130, 246, 0.75)', // Accent Blue
          'rgba(245, 158, 11, 0.75)', // Warning Amber
          'rgba(239, 68, 68, 0.75)',  // Danger Crimson
          'rgba(34, 197, 94, 0.75)',  // Success Green
          'rgba(168, 85, 247, 0.75)'  // Purple
        ],
        borderColor: [
          '#3B82F6',
          '#F59E0B',
          '#EF4444',
          '#22C55E',
          '#A855F7'
        ],
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options
  });
}
