/**
 * Sprint 3A — published-page SSR load test (the cold path for every page view).
 *
 * Target: GET {EDGE_URL}/p/:slug — server-side rendered published page.
 * This is where the ~99% cache-hit goal (Sprint 3C) must hold under load.
 *
 * Run:
 *   k6 run tests/load/k6/published-page.js
 *   EDGE_URL=https://edge.example.com PAGE_SLUG=pricing k6 run tests/load/k6/published-page.js
 *
 * Goal: 500 req/s sustained, p95 < 500ms, error rate < 1%, cache HIT > 95%.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { EDGE_URL, commonThresholds } from './lib/common.js';

const SLUG = __ENV.PAGE_SLUG || 'home';

export const options = {
    stages: [
        { duration: '5m', target: 500 }, // ramp to ~500 concurrent
        { duration: '5m', target: 500 },
        { duration: '2m', target: 0 },
    ],
    thresholds: {
        ...commonThresholds,
        'cache hit rate': ['rate>0.95'], // custom sub-metric (set in default())
    },
};

export default function () {
    const res = http.get(`${EDGE_URL}/p/${SLUG}`);

    const isHit = res.headers['X-Fb-Cache'] && res.headers['X-Fb-Cache'] !== 'stale';

    check(res, {
        'page 200': (r) => r.status === 200,
        'rendered html': (r) => r.body && r.body.length > 200,
        'served from cache': () => !!isHit,
    });

    // custom metric tag for the cache-hit threshold above
    check(res, { 'cache hit rate': () => !!isHit });

    sleep(Math.random()); // 0–1s randomized pacing
}
