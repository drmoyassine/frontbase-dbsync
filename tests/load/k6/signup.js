/**
 * Sprint 3A — signup burst load test.
 *
 * Target: POST /api/auth/signup (the true bottleneck under an AppSumo burst —
 * creates SuperTokens user + tenant + project + sends email).
 *
 * Run:
 *   k6 run tests/load/k6/signup.js
 *   BASE_URL=https://api.example.com k6 run tests/load/k6/signup.js
 *
 * Goal: 5k signups across the run, p95 < 2s (signup is heavier than a read,
 * so it gets a looser latency budget than page SSR), error rate < 1%.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, commonThresholds, uniqueEmail } from './lib/common.js';

export const options = {
    // 100 concurrent signup VUs. At ~0.5s pacing that's ~200 signups/s → ~120k over 10m;
    // tune --env-vus or the stage target for the 5k-in-48h burst shape.
    stages: [
        { duration: '5m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 0 },
    ],
    thresholds: {
        ...commonThresholds,
        'http_req_duration': ['p(95)<2000'], // signup is allowed 2s (email handoff)
    },
};

export default function () {
    const email = uniqueEmail('signup');
    const payload = JSON.stringify({
        email,
        password: 'LoadTestPass!2026',
        workspace_name: `Load Workspace ${__VU}-${__ITER}`,
        slug: `load-${__VU}-${__ITER}`,
    });

    const res = http.post(`${BASE_URL}/api/auth/signup`, payload, {
        headers: { 'Content-Type': 'application/json' },
    });

    check(res, {
        'signup 2xx': (r) => r.status >= 200 && r.status < 300,
        'signup under 2s': (r) => r.timings.duration < 2000,
        'no server error': (r) => r.status < 500,
    });

    // Signups are bursty, not flat-out — pace to model real arrivals.
    sleep(0.5);
}
