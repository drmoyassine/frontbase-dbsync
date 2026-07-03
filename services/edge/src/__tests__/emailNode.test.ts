import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeEmailNode, validateEmailNode } from '../nodes/EmailNode.js';
import { getTenantSecret } from '../config/tenantSecrets.js';

vi.mock('../config/tenantSecrets.js', () => ({
    getTenantSecret: vi.fn(),
}));

global.fetch = vi.fn() as any;

describe('Email Node', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Single-tenant credential source consumed by resolveEmailCredentials().
        process.env.FRONTBASE_INTEGRATIONS = JSON.stringify({
            'acct-1': { provider: 'resend', api_key: 're_test_key' },
        });
    });

    afterEach(() => {
        delete process.env.FRONTBASE_INTEGRATIONS;
    });

    describe('validateEmailNode', () => {
        it('passes with valid inputs', () => {
            const result = validateEmailNode({
                to: 'test@example.com',
                subject: 'Test',
                body: 'Test body',
            });
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('fails without a recipient', () => {
            const result = validateEmailNode({ subject: 'Test', body: 'body' });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Recipient (to) is required');
        });

        it('fails without a subject', () => {
            const result = validateEmailNode({ to: 'test@example.com', body: 'body' });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Subject is required');
        });

        it('fails without a body', () => {
            const result = validateEmailNode({ to: 'test@example.com', subject: 'Test' });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Body is required');
        });

        it('validates email array format', () => {
            const result = validateEmailNode({
                to: ['test@example.com', 'invalid'],
                subject: 'Test',
                body: 'body',
            });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('Invalid email'))).toBe(true);
        });
    });

    describe('executeEmailNode', () => {
        it('sends an email with valid inputs', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => ({ id: 'msg-123' }),
            });

            const result = await executeEmailNode({
                to: 'test@example.com',
                subject: 'Test Subject',
                body: '<p>Test Body</p>',
                isHtml: true,
            });

            expect(result.sent).toBe(true);
            expect(result.messageId).toBe('msg-123');
            expect(result.provider).toBe('resend');
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.resend.com/emails',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: 'Bearer re_test_key',
                    }),
                }),
            );
        });

        it('handles API errors gracefully', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
                status: 503,
                text: async () => 'Service unavailable',
            });

            const result = await executeEmailNode({
                to: 'test@example.com',
                subject: 'Test',
                body: 'Test',
            });

            expect(result.sent).toBe(false);
            expect(result.error).toContain('Service unavailable');
        });

        it('handles network errors', async () => {
            (global.fetch as any).mockRejectedValue(new Error('Network error'));

            const result = await executeEmailNode({
                to: 'test@example.com',
                subject: 'Test',
                body: 'Test',
            });

            expect(result.sent).toBe(false);
            expect(result.error).toContain('Network error');
        });

        it('fails when no email provider credentials are configured', async () => {
            delete process.env.FRONTBASE_INTEGRATIONS;

            const result = await executeEmailNode({
                to: 'test@example.com',
                subject: 'Test',
                body: 'Test',
            });

            expect(result.sent).toBe(false);
            expect(result.error).toContain('No email provider credentials');
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('wraps a single recipient into an array', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => ({ id: 'msg-123' }),
            });

            await executeEmailNode({
                to: 'test@example.com',
                subject: 'Test',
                body: 'Test',
            });

            const callArgs = (global.fetch as any).mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(Array.isArray(body.to)).toBe(true);
            expect(body.to).toEqual(['test@example.com']);
        });

        it('wraps plain-text body in HTML tags', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => ({ id: 'msg-123' }),
            });

            await executeEmailNode({
                to: 'test@example.com',
                subject: 'Test',
                body: 'Plain text',
                isHtml: false,
            });

            const callArgs = (global.fetch as any).mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body.html).toBe('<p>Plain text</p>');
        });

        it('resolves multi-tenant credentials via getTenantSecret', async () => {
            (getTenantSecret as any).mockResolvedValue({
                'tenant-acct': { provider: 'resend', api_key: 're_tenant_key' },
            });
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => ({ id: 'msg-456' }),
            });

            const result = await executeEmailNode({
                to: 'test@example.com',
                subject: 'Test',
                body: 'Test',
                _tenantSlug: 'acme',
            });

            expect(getTenantSecret).toHaveBeenCalledWith('integrations', 'acme');
            expect(result.sent).toBe(true);
            // Tenant credentials win over FRONTBASE_INTEGRATIONS.
            const callArgs = (global.fetch as any).mock.calls[0];
            expect(callArgs[1].headers.Authorization).toBe('Bearer re_tenant_key');
        });
    });
});
