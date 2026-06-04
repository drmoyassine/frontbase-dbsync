import { getBlockedIpsAsync } from '../config/securityConfig.js';

/**
 * IP Blocklist middleware for Edge Engine.
 * Fast-filters blocked IPs based on tenant-scoped lists and global default list.
 * Exact string matching only (CIDR deferred).
 * Fail-safe: if config parser fails or throws, requests are allowed.
 */
export async function ipBlocklist(c: any, next: any) {
    const clientIp = c.req.header('cf-connecting-ip') || 
                     c.req.header('x-forwarded-for')?.split(',')[0].trim() || 
                     c.req.header('x-real-ip') ||
                     'unknown';

    if (clientIp === 'unknown') {
        return await next();
    }

    try {
        const tenantSlug = c.get('tenantSlug') || '_default';
        const blockedIps = await getBlockedIpsAsync(tenantSlug);
        const defaultBlockedIps = tenantSlug !== '_default' ? await getBlockedIpsAsync('_default') : [];

        if (blockedIps.includes(clientIp) || defaultBlockedIps.includes(clientIp)) {
            console.warn(`[Edge IP Blocklist] Blocked request from IP: ${clientIp} for tenant: ${tenantSlug}`);
            return c.json({
                error: 'Blocked',
                message: 'Access denied. Your IP address is blocked.',
            }, 403);
        }
    } catch (e) {
        console.warn(`[Edge IP Blocklist] Error in IP blocking check (fail-safe enabled):`, (e as Error).message);
    }

    return await next();
}
