/**
 * Edge Sentry integration — runtime-agnostic via Toucan-JS.
 *
 * Toucan is an edge-native Sentry client built on fetch + crypto (no Node deps),
 * so the SAME code path serves every deployment runtime (Cloudflare, Deno,
 * Vercel, Netlify, Supabase, Docker). No-op when SENTRY_DSN is unset, so edges
 * deployed without it stay telemetry-free.
 *
 * SENTRY_DSN reaches the worker as a platform secret that every deploy API pushes
 * (see backend `secrets_builder.build_engine_secrets`). On Cloudflare it is
 * bridged into `process.env` by the adapter's env loop; elsewhere it is a plain
 * env var. Read uniformly here.
 *
 * Flush note: for launch we rely on Toucan's in-request fetch transport. If edge
 * events start dropping under fast Worker termination, wire `ctx.waitUntil` (the
 * deferred `waitUntil`-in-`IEdgeAdapter` abstraction, P2-7) — not built yet by
 * decision. See docs/plans/p4_implementation_plan.md §P2-7.
 */

import { Toucan } from 'toucan-js';
import type { Context } from 'hono';

let _client: Toucan | null | undefined;

/** Lazily create the shared Toucan client. Null (cached) when SENTRY_DSN is unset. */
function getClient(): Toucan | null {
    if (_client !== undefined) return _client;

    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        _client = null;
        return null;
    }

    try {
        _client = new Toucan({
            dsn,
            // Low sample rate — keep ingest volume modest; errors are the point.
            sampleRate: parseFloat(process.env.SENTRY_SAMPLE_RATE || '1'),
            environment: process.env.FRONTBASE_DEPLOYMENT_MODE || 'edge',
            // default fetch transport (runtime-agnostic)
        });
    } catch {
        _client = null;
    }
    return _client;
}

/** True when the edge has a Sentry DSN configured. */
export function isEdgeSentryEnabled(): boolean {
    return getClient() !== null;
}

/**
 * Capture an edge error with request + tenant + deployment context. Safe to
 * call from `app.onError` with or without a Hono context.
 *
 * Uses `withScope` so tags apply to THIS event only — critical because the
 * Toucan client is a singleton reused across requests on a shared isolate.
 */
export function captureEdgeException(err: unknown, c?: Context): void {
    const client = getClient();
    if (!client) return;

    const tags: Record<string, string> = {
        runtime: process.env.FRONTBASE_ADAPTER_PLATFORM || 'unknown',
    };

    if (c) {
        try {
            const slug = (c as unknown as { var?: { tenantSlug?: string } }).var?.tenantSlug;
            if (slug) tags.tenant = String(slug);
        } catch {
            /* ignore */
        }
        try {
            tags.path = new URL(c.req.url).pathname;
        } catch {
            /* ignore */
        }
        try {
            tags.method = c.req.method;
        } catch {
            /* ignore */
        }
    }

    try {
        client.withScope((scope: Toucan) => {
            scope.setTags(tags);
            scope.captureException(err);
        });
    } catch {
        // Telemetry must never break error handling.
    }
}
