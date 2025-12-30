import axios from 'axios'
import { getFastApiBaseUrl } from '../../../lib/portConfig';

const getBaseUrl = () => {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) return envUrl;

    // Use centralized configuration which handles Prod/Dev logic
    return getFastApiBaseUrl();
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
