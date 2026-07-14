import { defineConfig } from '@hey-api/openapi-ts';

/**
 * Generated API client (CF-22 P0 / W2).
 *
 * Source of truth: fastapi-backend/contracts/openapi.full.json — exported by
 * `npm run contracts:export` (deterministic; CI checks staleness). Regenerate
 * with `npm run client:generate` after any backend contract change.
 *
 * Output is fully generated — NEVER edit src/client/ by hand. Services in
 * src/services/ migrate onto this client (raw axios is being phased out).
 */
export default defineConfig({
    input: 'fastapi-backend/contracts/openapi.full.json',
    output: 'src/client',
    plugins: [
        // NOTE: the generated client bakes a default baseURL derived from the
        // input path. The real runtime baseURL ('', i.e. relative — Vite proxy
        // in dev, Nginx in prod) + auth interceptors are set in src/lib/api-client.ts,
        // which main.tsx imports before any SDK call. Do NOT call the SDK without
        // that side-effect import.
        '@hey-api/client-axios',
        '@tanstack/react-query',
        'zod',
    ],
});
