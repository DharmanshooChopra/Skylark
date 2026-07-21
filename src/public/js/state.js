/**
 * Frontend State Management Store.
 * Centralized, reactive state properties for the BI Terminal.
 */

const state = {
  connectionStatus: 'disconnected',
  syncTime: 'Never',
  activeView: 'terminal', // 'terminal' or 'ledger'
  ledgerTab: 'deals',     // 'deals' or 'wos'
  kpis: null,
  dataHealth: null,
  activeQuery: '',
  activeResponse: null,
  boards: [],
  columnMappings: null,
  activityLogs: []
};

const listeners = [];

/**
 * Register state mutation listeners.
 */
export function subscribe(listener) {
  listeners.push(listener);
}

/**
 * Dispatch changes to all subscribed listeners.
 */
function notify(changedProp) {
  listeners.forEach(fn => fn(state, changedProp));
}

export const store = {
  get: () => state,
  
  setConnectionStatus: (status) => {
    state.connectionStatus = status;
    notify('connectionStatus');
  },
  
  setSyncTime: (time) => {
    state.syncTime = time;
    notify('syncTime');
  },
  
  setActiveView: (view) => {
    state.activeView = view;
    notify('activeView');
  },

  setLedgerTab: (tab) => {
    state.ledgerTab = tab;
    notify('ledgerTab');
  },
  
  setKPIs: (kpis) => {
    state.kpis = kpis;
    notify('kpis');
  },
  
  setDataHealth: (health) => {
    state.dataHealth = health;
    notify('dataHealth');
  },
  
  setActiveResponse: (query, response) => {
    state.activeQuery = query;
    state.activeResponse = response;
    notify('activeResponse');
  },
  
  setBoards: (boards) => {
    state.boards = boards;
    notify('boards');
  },
  
  setColumnMappings: (mappings) => {
    state.columnMappings = mappings;
    notify('columnMappings');
  },
  
  addActivity: (message) => {
    const timestamp = new Date().toLocaleTimeString();
    state.activityLogs.unshift(`[${timestamp}] ${message}`);
    // Keep last 30 logs only
    if (state.activityLogs.length > 30) {
      state.activityLogs.pop();
    }
    notify('activityLogs');
  }
};
