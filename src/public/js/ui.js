/**
 * Core User Interface Controls, Drawers, Skeletons, and Alerts.
 */

import { store } from './state.js';

/**
 * Pushes a toast notification banner to the screen.
 * 
 * @param {string} message 
 * @param {'success' | 'warning' | 'danger'} type 
 */
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;

  container.appendChild(toast);

  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

/**
 * Displays global top header error banner.
 * @param {string} message 
 */
export function showErrorBanner(message) {
  const banner = document.getElementById('error-banner');
  if (!banner) return;
  
  const msgText = banner.querySelector('.error-banner-message');
  if (msgText) msgText.innerText = message;
  
  banner.classList.remove('hidden');
}

/**
 * Hides global top header error banner.
 */
export function hideErrorBanner() {
  const banner = document.getElementById('error-banner');
  if (banner) banner.classList.add('hidden');
}

/**
 * Controls connection settings overlay drawer display status.
 */
export function toggleSettings(forceState) {
  const panel = document.getElementById('settings-panel');
  const backdrop = document.getElementById('settings-backdrop');
  if (!panel || !backdrop) return;

  const show = forceState !== undefined ? forceState : panel.classList.contains('hidden');
  
  if (show) {
    panel.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    store.addActivity('Settings drawer focused');
  } else {
    panel.classList.add('hidden');
    backdrop.classList.add('hidden');
  }
}

/**
 * Switches between workspace sections (Terminal view vs raw Data Ledger).
 * 
 * @param {'terminal' | 'ledger'} viewName 
 */
export function switchView(viewName) {
  const vTerminal = document.getElementById('view-terminal');
  const vLedger = document.getElementById('view-ledger');
  
  const navTerminal = document.getElementById('nav-terminal');
  const navLedger = document.getElementById('nav-ledger');

  if (viewName === 'terminal') {
    vTerminal.classList.remove('hidden');
    vLedger.classList.add('hidden');
    navTerminal.classList.add('active');
    navTerminal.setAttribute('aria-current', 'page');
    navLedger.classList.remove('active');
    navLedger.removeAttribute('aria-current');
  } else {
    vTerminal.classList.add('hidden');
    vLedger.classList.remove('hidden');
    navTerminal.classList.remove('active');
    navTerminal.removeAttribute('aria-current');
    navLedger.classList.add('active');
    navLedger.setAttribute('aria-current', 'page');
  }
  
  store.setActiveView(viewName);
  store.addActivity(`Switched workspace view to: ${viewName}`);
}

/**
 * Fills KPI pulse grid with skeleton placeholders during loading cycles.
 */
export function renderKpiSkeletons() {
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;

  grid.innerHTML = Array(4).fill(0).map(() => `
    <div class="kpi-card skeleton">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line tall"></div>
      <div class="skeleton-line short"></div>
    </div>
  `).join('');
}
