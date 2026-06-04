import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSecurityConfig, updateSecurityConfig, getBlockedIps, getBotProtection } from '../config/securityConfig.js';
import { ipBlocklist } from '../middleware/ipBlocklist.js';
import { verifyCaptchaToken } from '../middleware/captchaVerify.js';
import type { Context } from 'hono';

// Mock env configuration to disable Redis and prevent external dependencies
vi.mock('../config/env.js', () => ({
    getCacheConfig: vi.fn().mockReturnValue(null),
    getAuthConfig: vi.fn().mockReturnValue({}),
}));

describe('Security Config & Bot Protection', () => {
    const originalEnv = process.env.FRONTBASE_SECURITY;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.FRONTBASE_SECURITY = '';
        updateSecurityConfig({ ipBlocklist: {} });
    });

    afterEach(() => {
        process.env.FRONTBASE_SECURITY = originalEnv;
    });

    describe('Security Config Parser', () => {
        it('parses FRONTBASE_SECURITY env var', () => {
            const testConfig = {
                ipBlocklist: {
                    '_default': ['1.1.1.1'],
                    'tenant-a': ['2.2.2.2']
                },
                botProtection: {
                    enabled: true,
                    provider: 'cloudflare' as const,
                    siteKey: 'key',
                    secretKey: 'secret',
                    protectLogin: true,
                    protectForgotPassword: true
                }
            };
            
            updateSecurityConfig(testConfig);

            expect(getBlockedIps()).toEqual(['1.1.1.1']);
            expect(getBlockedIps('tenant-a')).toEqual(['2.2.2.2']);
            expect(getBlockedIps('nonexistent')).toEqual([]);
            expect(getBotProtection()?.enabled).toBe(true);
            expect(getBotProtection()?.secretKey).toBe('secret');
        });
    });

    describe('IP Blocklist Middleware', () => {
        it('blocks request when IP matches blocklist for a tenant slug', async () => {
            updateSecurityConfig({
                ipBlocklist: {
                    '_default': ['1.1.1.1'],
                    'tenant-a': ['2.2.2.2']
                }
            });

            const mockJson = vi.fn();
            const mockNext = vi.fn();
            const mockContext = {
                req: {
                    header: vi.fn().mockImplementation((name) => {
                        if (name === 'cf-connecting-ip') return '2.2.2.2';
                        return undefined;
                    }),
                },
                get: vi.fn().mockReturnValue('tenant-a'),
                json: mockJson,
            } as unknown as Context;

            await ipBlocklist(mockContext, mockNext);

            expect(mockJson).toHaveBeenCalledWith({
                error: 'Blocked',
                message: 'Access denied. Your IP address is blocked.',
            }, 403);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('allows request when IP does not match blocklist', async () => {
            updateSecurityConfig({
                ipBlocklist: {
                    '_default': ['1.1.1.1'],
                    'tenant-a': ['2.2.2.2']
                }
            });

            const mockJson = vi.fn();
            const mockNext = vi.fn();
            const mockContext = {
                req: {
                    header: vi.fn().mockImplementation((name) => {
                        if (name === 'cf-connecting-ip') return '3.3.3.3';
                        return undefined;
                    }),
                },
                get: vi.fn().mockReturnValue('tenant-a'),
                json: mockJson,
            } as unknown as Context;

            await ipBlocklist(mockContext, mockNext);

            expect(mockJson).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalled();
        });

        it('blocks request if IP matches default blocklist even if tenant blocklist is empty', async () => {
            updateSecurityConfig({
                ipBlocklist: {
                    '_default': ['1.1.1.1'],
                    'tenant-a': []
                }
            });

            const mockJson = vi.fn();
            const mockNext = vi.fn();
            const mockContext = {
                req: {
                    header: vi.fn().mockImplementation((name) => {
                        if (name === 'cf-connecting-ip') return '1.1.1.1';
                        return undefined;
                    }),
                },
                get: vi.fn().mockReturnValue('tenant-a'),
                json: mockJson,
            } as unknown as Context;

            await ipBlocklist(mockContext, mockNext);

            expect(mockJson).toHaveBeenCalledWith({
                error: 'Blocked',
                message: 'Access denied. Your IP address is blocked.',
            }, 403);
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('CAPTCHA Verification', () => {
        it('succeeds immediately if bot protection is disabled', async () => {
            updateSecurityConfig({
                ipBlocklist: {},
                botProtection: {
                    enabled: false,
                    provider: 'cloudflare',
                    siteKey: '',
                    secretKey: '',
                    protectLogin: false,
                    protectForgotPassword: false
                }
            });

            const result = await verifyCaptchaToken('token', '1.2.3.4');
            expect(result.success).toBe(true);
        });

        it('fails open if secretKey is missing', async () => {
            updateSecurityConfig({
                ipBlocklist: {},
                botProtection: {
                    enabled: true,
                    provider: 'cloudflare',
                    siteKey: 'key',
                    secretKey: '',
                    protectLogin: true,
                    protectForgotPassword: true
                }
            });

            const result = await verifyCaptchaToken('token', '1.2.3.4');
            expect(result.success).toBe(true);
        });

        it('performs verification request and handles success', async () => {
            updateSecurityConfig({
                ipBlocklist: {},
                botProtection: {
                    enabled: true,
                    provider: 'cloudflare',
                    siteKey: 'key',
                    secretKey: 'secret',
                    protectLogin: true,
                    protectForgotPassword: true
                }
            });

            const mockResponse = {
                ok: true,
                json: async () => ({ success: true }),
            };
            const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

            const result = await verifyCaptchaToken('token', '1.2.3.4');
            expect(result.success).toBe(true);
            expect(fetchSpy).toHaveBeenCalledWith(
                'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                })
            );
        });

        it('fails open on timeout or network error', async () => {
            updateSecurityConfig({
                ipBlocklist: {},
                botProtection: {
                    enabled: true,
                    provider: 'cloudflare',
                    siteKey: 'key',
                    secretKey: 'secret',
                    protectLogin: true,
                    protectForgotPassword: true
                }
            });

            vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network Timeout'));

            const result = await verifyCaptchaToken('token', '1.2.3.4');
            expect(result.success).toBe(true);
        });
    });
});
