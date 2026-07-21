/**
 * API Service for communication with the Express Backend endpoints.
 */

const BASE_URL = '/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(url, config);
    const result = await response.json();
    
    if (!response.ok) {
      const errorMsg = result.error?.message || `HTTP Request failed with status ${response.status}`;
      throw new Error(errorMsg);
    }
    
    return result;
  } catch (error) {
    console.error(`API Request to ${endpoint} failed:`, error);
    throw error;
  }
}

export const api = {
  getHealth: () => request('/health'),
  getBoards: () => request('/monday/boards'),
  getStatus: () => request('/monday/status'),
  saveConfig: (configData) => request('/monday/config', {
    method: 'POST',
    body: JSON.stringify(configData)
  }),
  syncData: () => request('/monday/sync', {
    method: 'POST'
  }),
  queryTerminal: (queryText) => request('/query', {
    method: 'POST',
    body: JSON.stringify({ query: queryText })
  })
};
