/**
 * Core User Interface Controls, Drawers, Skeletons, Alerts, and Section View Switching.
 */

import { store } from './state.js';

/**
 * Pushes a toast notification banner to the screen.
 */
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;

  container.appendChild(toast);

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
 * Switches between workspace sections (Executive Briefing, Analytics Canvas, System Integrity, Data Ledger).
 * 
 * @param {'terminal' | 'analytics' | 'integrity' | 'ledger'} viewName 
 */
export function switchView(viewName) {
  const views = {
    terminal: document.getElementById('view-terminal'),
    analytics: document.getElementById('view-analytics'),
    integrity: document.getElementById('view-integrity'),
    ledger: document.getElementById('view-ledger')
  };

  const navs = {
    terminal: document.getElementById('nav-terminal'),
    analytics: document.getElementById('nav-analytics'),
    integrity: document.getElementById('nav-integrity'),
    ledger: document.getElementById('nav-ledger')
  };

  Object.keys(views).forEach(key => {
    if (views[key]) {
      if (key === viewName) {
        views[key].classList.remove('hidden');
      } else {
        views[key].classList.add('hidden');
      }
    }

    if (navs[key]) {
      if (key === viewName) {
        navs[key].classList.add('active');
        navs[key].setAttribute('aria-current', 'page');
      } else {
        navs[key].classList.remove('active');
        navs[key].removeAttribute('aria-current');
      }
    }
  });

  store.setActiveView(viewName);
  store.addActivity(`Switched workspace section to: ${viewName.toUpperCase()}`);
}

/**
 * Fills KPI pulse grid with skeleton placeholders during loading cycles.
 */
export function renderKpiSkeletons() {
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;

  grid.innerHTML = Array(5).fill(0).map(() => `
    <div class="kpi-widget skeleton">
      <div class="sk-line"></div>
      <div class="sk-val"></div>
    </div>
  `).join('');
}
