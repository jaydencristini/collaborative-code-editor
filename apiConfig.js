// src/apiConfig.js - Frontend API configuration

const isDevelopment = import.meta.env.DEV;

// Get the base URL for API calls
export const getApiUrl = () => {
  if (isDevelopment) {
    return "http://localhost:3001";
  }
  // In production, API is served from same origin
  return window.location.origin;
};

// Get WebSocket URL
export const getWsUrl = () => {
  if (isDevelopment) {
    return "ws://localhost:3001";
  }
  // In production, use wss:// with same host
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
};

export const apiConfig = {
  apiUrl: getApiUrl(),
  wsUrl: getWsUrl(),
};
