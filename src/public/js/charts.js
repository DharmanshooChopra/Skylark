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
    const parent = canvas.parentElement;
    if (parent) {
      parent.closest('.chart-card').classList.add('hidden');
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
  const accentColor = '#3B82F6';
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false // Hide legend to conserve space in dense executive panel
      },
      tooltip: {
        backgroundColor: '#1E293B',
        borderColor: '#334155',
        borderWidth: 1,
        titleFont: { family: 'Inter', size: 12, weight: 'bold' },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 10,
        displayColors: false
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
          callback: (value) => {
            if (value >= 1000) {
              return '$' + (value / 1000) + 'k';
            }
            return value;
          }
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
          'rgba(239, 68, 68, 0.75)'   // Danger Crimson
        ],
        borderColor: [
          '#3B82F6',
          '#F59E0B',
          '#EF4444'
        ],
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options
  });
}
