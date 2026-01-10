/**
 * Authentication Middleware for Hono Actions Engine
 * 
 * Sprint 2: Security Layer
 * 
 * This module provides:
 * - Bearer token auth for webhooks (API keys)
 * - JWT verification for edge-deployed end user routes (future)
 * - IP restriction helpers
 */

import { bearerAuth } from 'hono/bearer-auth';
import { jwt } from 'hono/jwt';
import { csrf } from 'hono/csrf';
import type { Context, Next } from 'hono';

// =============================================================================
// API Key Authentication (for Webhooks)
// =============================================================================

/**
 * Bearer token middleware for webhook endpoints.
 * Validates API keys from the API_KEYS environment variable.
 * 
 * Usage: app.use('/webhook/*', apiKeyAuth);
 */
export const apiKeyAuth = bearerAuth({
    verifyToken: async (token: string, c: Context) => {
        const validKeys = (process.env.API_KEYS || '').split(',').filter(k => k.trim());

        if (validKeys.length === 0) {
            // No API keys configured - allow all (dev mode)
            console.warn('⚠️ No API_KEYS configured - webhook auth disabled');
            return true;
        }

        return validKeys.includes(token.trim());
    },
});

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
