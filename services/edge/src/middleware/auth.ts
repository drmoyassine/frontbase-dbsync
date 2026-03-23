/**
 * Authentication Middleware for Hono Edge Engine
 * 
 * Three auth layers:
 * 1. systemKeyAuth  — M2M (FastAPI → Edge) via x-system-key header
 * 2. userApiKeyAuth — User-facing (AI + webhooks) via Authorization: Bearer
 * 3. JWT / CSRF / IP — Supplementary security helpers
 * 
 * Scoped API keys: each user key has a scope ('user' | 'management' | 'all').
 * - 'user' scope keys work on /v1/* (AI) and /api/webhook/* routes
 * - 'management' scope keys work on management endpoints as a fallback to system key
 * - 'all' scope keys work everywhere
 */

import { jwt } from 'hono/jwt';
import { csrf } from 'hono/csrf';
import type { Context, Next } from 'hono';

// =============================================================================
// Shared Helpers
// =============================================================================

interface APIKeyHashEntry {
    prefix: string;
    hash: string;
    scope: string;       // 'user' | 'management' | 'all'
    expires_at: string | null;
}

/** Parse FRONTBASE_API_KEY_HASHES env var into typed entries. Returns null on error. */
function parseKeyHashes(): APIKeyHashEntry[] | null {
    const envHashes = process.env.FRONTBASE_API_KEY_HASHES;
    if (!envHashes) return null;
    try {
        return JSON.parse(envHashes);
    } catch {
        console.error('[Auth] Failed to parse FRONTBASE_API_KEY_HASHES');
        return null;
    }
}

/** Extract Bearer token from Authorization header. */
function extractBearerToken(c: Context): string | null {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7).trim();
}

/** SHA-256 hash a string and return hex digest. */
async function sha256(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Validate a Bearer token against stored hashes, checking scope. */
async function validateApiKey(
    token: string,
    allowedScopes: string[],
): Promise<APIKeyHashEntry | null> {
    const keyEntries = parseKeyHashes();
    if (!keyEntries || keyEntries.length === 0) return null;

    const tokenHash = await sha256(token);
    const matched = keyEntries.find(k => k.hash === tokenHash);
    if (!matched) return null;

    // Check scope — treat missing scope as 'user' for backward compatibility
    const keyScope = matched.scope || 'user';
    if (!allowedScopes.includes(keyScope) && keyScope !== 'all') {
        return null;
    }

    // Check expiry
    if (matched.expires_at) {
        if (new Date(matched.expires_at) < new Date()) return null;
    }

    return matched;
}

// =============================================================================
// System Key Authentication (M2M: FastAPI → Edge)
// =============================================================================

/**
 * System key middleware for management endpoints.
 * Validates the x-system-key header against FRONTBASE_SYSTEM_KEY env var.
 * 
 * Fallback: also accepts user API keys with scope 'management' or 'all'
 * (for power-user scripting against the engine).
 * 
 * Dev mode: if no FRONTBASE_SYSTEM_KEY is configured, all requests pass through.
 */
export const systemKeyAuth = async (c: Context, next: Next) => {
    const systemKey = process.env.FRONTBASE_SYSTEM_KEY;

    if (!systemKey) {
        // No system key configured — allow all (dev mode / local Docker)
        return next();
    }

    // 1. Check x-system-key header (primary path — FastAPI M2M)
    const sysHeader = c.req.header('x-system-key');
    if (sysHeader && sysHeader === systemKey) {
        return next();
    }

    // 2. Fallback: check user API key with management scope
    const bearerToken = extractBearerToken(c);
    if (bearerToken) {
        const matched = await validateApiKey(bearerToken, ['management', 'all']);
        if (matched) return next();
    }

    return c.json({
        error: {
            message: 'Unauthorized. Provide x-system-key header or a management-scoped API key.',
            type: 'invalid_request_error',
            code: 'unauthorized',
        },
    }, 401);
};

// =============================================================================
// User API Key Authentication (for /v1/* AI + /api/webhook/* endpoints)
// =============================================================================

/**
 * User API key middleware for user-facing endpoints.
 * Validates Bearer token against FRONTBASE_API_KEY_HASHES with scope checking.
 * 
 * Accepts keys with scope 'user' or 'all'.
 * Returns OpenAI-compatible error format on auth failure.
 * 
 * Dev mode: if no API key hashes are configured, all requests pass through.
 */
export const userApiKeyAuth = async (c: Context, next: Next) => {
    const envHashes = process.env.FRONTBASE_API_KEY_HASHES;
    const isDev = (process.env.NODE_ENV || 'development') === 'development';

    if (!envHashes) {
        if (isDev) return next();
        return c.json({
            error: {
                message: 'No API keys configured for this engine.',
                type: 'invalid_request_error',
                code: 'no_api_keys_configured',
            },
        }, 403);
    }

    const keyEntries = parseKeyHashes();
    if (!keyEntries) {
        return c.json({
            error: {
                message: 'API key configuration error. Contact administrator.',
                type: 'server_error',
                code: 'config_error',
            },
        }, 500);
    }

    if (keyEntries.length === 0) {
        if (isDev) return next();
        return c.json({
            error: {
                message: 'No API keys configured for this engine.',
                type: 'invalid_request_error',
                code: 'no_api_keys_configured',
            },
        }, 403);
    }

    const token = extractBearerToken(c);
    if (!token) {
        return c.json({
            error: {
                message: 'Missing or invalid Authorization header. Use: Authorization: Bearer <api_key>',
                type: 'invalid_request_error',
                code: 'missing_api_key',
            },
        }, 401);
    }

    const matched = await validateApiKey(token, ['user', 'all']);
    if (!matched) {
        return c.json({
            error: {
                message: 'Invalid API key or insufficient scope.',
                type: 'invalid_request_error',
                code: 'invalid_api_key',
            },
        }, 401);
    }

    return next();
};

// Legacy alias — kept for backward compatibility (used by lite.ts import)
export const aiApiKeyAuth = userApiKeyAuth;

// =============================================================================
// JWT Authentication (for Edge-deployed End User Routes)
// =============================================================================

/**
 * JWT middleware for Supabase-authenticated end users.
 * Used when pages/actions are deployed to Edge (not proxied through FastAPI).
 * 
 * Usage: app.use('/api/*', supabaseJwtAuth);
 */
export const createSupabaseJwtAuth = (secret: string) => jwt({
    secret,
    alg: 'HS256',
});

/**
 * Factory to create JWT auth from environment.
 * Falls back to allowing all if no secret configured (dev mode).
 */
export const supabaseJwtAuth = (c: Context, next: Next) => {
    const secret = process.env.SUPABASE_JWT_SECRET;

    if (!secret) {
        console.warn('⚠️ No SUPABASE_JWT_SECRET configured - JWT auth disabled');
        return next();
    }

    return createSupabaseJwtAuth(secret)(c, next);
};

// =============================================================================
// CSRF Protection (for SSR Forms)
// =============================================================================

/**
 * CSRF middleware for protecting SSR forms.
 * 
 * Usage: app.use('/forms/*', csrfProtection);
 */
export const csrfProtection = csrf({
    origin: (origin, c) => {
        // Allow configured origins
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
        return allowedOrigins.includes(origin);
    },
});

// =============================================================================
// IP Restriction (for Webhook Security)
// =============================================================================

/**
 * IP allowlist middleware factory.
 * 
 * Usage: app.use('/webhook/*', ipAllowlist(['192.168.1.0/24', '10.0.0.1']));
 */
export const ipAllowlist = (allowedIps: string[]) => {
    return async (c: Context, next: Next) => {
        // Get client IP from various headers
        const clientIp = c.req.header('cf-connecting-ip')
            || c.req.header('x-real-ip')
            || c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
            || 'unknown';

        if (allowedIps.length === 0) {
            // No IPs configured - allow all
            return next();
        }

        // Simple exact match (CIDR support would need additional library)
        if (allowedIps.includes(clientIp)) {
            return next();
        }

        console.warn(`🚫 IP ${clientIp} not in allowlist`);
        return c.json({ error: 'Forbidden', message: 'IP not allowed' }, 403);
    };
};
