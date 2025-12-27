import axios from 'axios';
import { PORT_CONFIG } from '../lib/portConfig';

// Get the current backend configuration from localStorage
const getBackendConfig = () => {
  // In development, always use empty baseURL so Vite proxy handles routing
  // The proxy in vite.config.ts routes /api to the correct backend
  if (import.meta.env.DEV) {
    return {
      type: 'vite-proxy',
      baseUrl: '', // Empty = relative URLs = goes through Vite proxy
    };
  }

  // In production, check for saved config but IGNORE localhost configs
  // This prevents Mixed Content errors when deploying to HTTPS
  const savedConfig = localStorage.getItem('backendConfig');
  if (savedConfig) {
    try {
      const config = JSON.parse(savedConfig);
      // If the saved config points to localhost, ignore it in production
      if (config.baseUrl && config.baseUrl.includes('localhost')) {
        console.warn('[API Service] Ignoring localhost config in production.');
        localStorage.removeItem('backendConfig'); // Clean up invalid config
      } else {
        return config;
      }
    } catch (e) {
      console.error('[API Service] Failed to parse backendConfig:', e);
      localStorage.removeItem('backendConfig');
    }
  }
  // Default to relative URL for Nginx proxy
  return {
    type: 'fastapi',
    baseUrl: '', // In production, use relative URL by default to leverage Nginx proxy
  };
};

// Create axios instance with dynamic baseURL
const createApiInstance = () => {
  const config = getBackendConfig();

  // Only log if debug is explicitly enabled
  if (localStorage.getItem('enableApiDebug') === 'true') {
    console.log('[API Service] Creating API instance with config:', config);
  }

  return axios.create({
    baseURL: config.baseUrl,
    headers: {
      'Content-Type': 'application/json',
    },
    withCredentials: true,
  });
};

// Create the initial API instance
let api = createApiInstance();

// Function to update API instance when backend config changes
export const updateApiInstance = () => {
  api = createApiInstance();

  // Only log if debug is explicitly enabled
  if (localStorage.getItem('enableApiDebug') === 'true') {
    console.log('[API Service] API instance updated with new backend config');
  }
};

// Request interceptor - no longer needed for auth but keeping structure for future use
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors and unpack response.data
api.interceptors.response.use(
  (response) => {
    // Return the full axios response so callers can access response.data
    // This maintains backward compatibility with existing code
    return response;
  },
  (error) => {
    // Standard error logging
    if (localStorage.getItem('enableApiDebug') === 'true') {
      console.error('[API Service] Response Error:', {
        url: error.config?.url,
        status: error.response?.status,
        message: error.message,
        data: error.response?.data
      });
    }
    return Promise.reject(error);
  }
);

export default api;