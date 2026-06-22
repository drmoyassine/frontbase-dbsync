/**
 * Shared k6 config + helpers for the Frontbase load-test suite (Sprint 3A).
 *
 * Everything is env-driven so the same scripts run against a local Docker stack
 * or a production deploy without code changes.
 *
 * AppSumo spike target (from appsumo_launch_roadmap.md):
 *   ~10k req/min sustained ≈ 167 req/s, p95 < 500ms, error rate < 1%.
 */
import { sleep } from 'k6';

// Where the FastAPI backend lives (signup / dashboard reads).
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
// Where the published-edge lives (SSR pages). Often a different host/port.
export const EDGE_URL = __ENV.EDGE_URL || 'http://localhost:8787';

/** Standard pass/fail gates shared across all scenarios. */
export const commonThresholds = {
    http_req_duration: ['p(95)<500'],   // p95 latency under 500ms
    http_req_failed: ['rate<0.01'],     // < 1% errors
};

/**
 * Unique email per VU+iteration so signups never collide on a re-run.
 * Tagged `+` addressing lands in one inbox for easy inspection/cleanup.
 */
export function uniqueEmail(prefix = 'loadtest') {
    return `${prefix}+vu${__VU}-i${__ITER}@frontbase-load.test`;
}

/** Ramp 0 → target over 5m, hold 5m, ramp down over 2m (12m total). */
export function rampStages(target) {
    return {
        stages: [
            { duration: '5m', target },
            { duration: '5m', target },
            { duration: '2m', target: 0 },
        ],
    };
}

/** Randomised think-time between actions (simulates real user pacing). */
export function think(min = 0.5, max = 1.5) {
    sleep(min + Math.random() * (max - min));
}
