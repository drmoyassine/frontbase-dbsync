// Single Source of Truth for Port Configuration
// This file ensures all components use the same port numbers

const isProd = import.meta.env.PROD;
const apiBaseUrl = import.meta.env.VITE_API_URL || '';

export const PORT_CONFIG = {
  express: {
    port: 3001,
    baseUrl: isProd ? apiBaseUrl : `http://localhost:3001`,
    description: "Express.js backend for Frontbase"
  },
  fastapi: {
    port: 8000,
    baseUrl: isProd ? apiBaseUrl : `http://localhost:8000`,
    description: "FastAPI backend for DB-Synchronizer"
  },
  frontend: {
    port: 5173,
    baseUrl: isProd ? window.location.origin : `http://localhost:5173`,
    description: "Vite development server for Frontbase frontend"
  }
};

// Helper functions for consistent port usage
export const getExpressBaseUrl = () => PORT_CONFIG.express.baseUrl;
export const getFastApiBaseUrl = () => PORT_CONFIG.fastapi.baseUrl;
export const getFrontendBaseUrl = () => PORT_CONFIG.frontend.baseUrl;

// For debugging - log current configuration (only when explicitly enabled)
export const logPortConfig = () => {
  if (localStorage.getItem('enablePortDebug') === 'true') {
    console.log("[PortConfig] Port Configuration (Single Source of Truth):");
    console.log(`   Express.js Backend: ${PORT_CONFIG.express.port}`);
    console.log(`   FastAPI Backend: ${PORT_CONFIG.fastapi.port}`);
    console.log(`   Frontend Dev Server: ${PORT_CONFIG.frontend.port}`);
  }
};

// Export default for convenience
export default PORT_CONFIG;