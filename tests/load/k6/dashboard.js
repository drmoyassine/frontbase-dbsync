/**
 * Sprint 3A — authenticated dashboard navigation load test.
 *
 * Simulates 100 concurrent operators: list datasources → list pages → check
 * health (exercises the read pool + the resilience block). Authenticate by
 * providing a dashboard bearer token via env (or leave blank for an
 * unauthenticated smoke run).
 *
 * Run:
 *   DASHBOARD_TOKEN=xxxx k6 run tests/load/k6/dashboard.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, commonThresholds } from './lib/common.js';

const TOKEN = __ENV.DASHBOARD_TOKEN || '';
const DS_PATH = __ENV.DATASOURCES_PATH || '/api/sync/datasources';
const PAGES_PATH = __ENV.PAGES_PATH || '/api/pages';

export const options = {
    stages: [
        { duration: '3m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 0 },
    ],
    thresholds: commonThresholds,
};

export default function () {
    const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

    // 1. list datasources (read-heavy)
    let res = http.get(`${BASE_URL}${DS_PATH}`, { headers });
    check(res, { 'datasources 2xx': (r) => r.status >= 200 && r.status < 300 });
    sleep(1);

    // 2. list pages
    res = http.get(`${BASE_URL}${PAGES_PATH}`, { headers });
    check(res, { 'pages 2xx': (r) => r.status >= 200 && r.status < 300 });
    sleep(1);

    // 3. health check (cheap, exercises the resilience block)
    res = http.get(`${BASE_URL}/api/health`, { headers });
    check(res, { 'health 200': (r) => r.status === 200 });
    sleep(1);
}
