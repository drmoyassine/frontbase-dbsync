import axios from 'axios'

const getBaseUrl = () => {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) return envUrl;

    // In local development, default to localhost:8000 if not specified.
    if (import.meta.env.DEV) {
        return 'http://localhost:8000';
    }

    // In production, ALWAYS use relative paths for Nginx proxy
    return '';
};

const API_URL = getBaseUrl();

// Append /api/sync to the base URL for the sync microservice
const SYNC_API_URL = `${API_URL}/api/sync`.replace(/([^:]\/)\/+/g, "$1"); // Normalize slashes just in case

export const api = axios.create({
    baseURL: SYNC_API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
})
