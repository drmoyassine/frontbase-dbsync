import { rateLimit } from '../cache/redis.js';

/**
 * IP-based sliding-window rate limiting middleware for Edge Engine.
 * Limits client IPs to 60 requests per minute.
 * Fail-safe: if Redis is not configured or throws errors, requests are allowed.
 */
export async function ipRateLimiter(c: any, next: any) {
    const clientIp = c.req.header('cf-connecting-ip') || 
                     c.req.header('x-forwarded-for')?.split(',')[0].trim() || 
                     c.req.header('x-real-ip') ||
                     'unknown';

    if (clientIp === 'unknown') {
        return await next();
    }

    try {
        const minuteTimestamp = Math.floor(Date.now() / 60000);
        const key = `rate:ip:${clientIp}:${minuteTimestamp}`;
        const { allowed, remaining } = await rateLimit(key, 60, 60); // 60 requests / 60 seconds
        
        if (!allowed) {
            console.warn(`[Edge Rate Limit] Blocked request from IP: ${clientIp}`);
            return c.json({
                error: 'TooManyRequests',
                message: 'Rate limit exceeded. Maximum 60 requests per minute allowed.',
            }, 429);
        }
        
        c.header('X-RateLimit-IP-Remaining', String(remaining));
    } catch (e) {
        // Redis not configured/initialized or connection error -> fail-safe fallback
    }

    return await next();
}
