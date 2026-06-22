import { describe, it, expect } from 'vitest';
import { buildAnalyticsHead, buildGtmNoscript, sanitizeCustomHead } from '../ssr/htmlDocument.js';

describe('builder analytics injection (Sprint 4A)', () => {
    describe('buildAnalyticsHead', () => {
        it('emits GA4 when only ga4 is set', () => {
            const head = buildAnalyticsHead({ ga4MeasurementId: 'G-ABCDEF1234' });
            expect(head).toContain('gtag/js?id=G-ABCDEF1234');
            expect(head).not.toContain('gtm.js');
        });

        it('emits GTM (and skips direct GA4) when both are set', () => {
            const head = buildAnalyticsHead({ ga4MeasurementId: 'G-ABCDEF1234', gtmContainerId: 'GTM-XYZ123' });
            // GTM builds its src at runtime; the container ID is passed into the loader.
            expect(head).toContain("gtm.js?id='+i+dl");
            expect(head).toContain("'dataLayer','GTM-XYZ123'");
            expect(head).not.toContain('gtag/js'); // GTM loads GA4 itself
        });

        it('emits nothing when neither is set', () => {
            expect(buildAnalyticsHead({})).toBe('');
        });

        it('rejects malformed IDs (no broken HTML)', () => {
            expect(buildAnalyticsHead({ ga4MeasurementId: 'not-a-valid-id' })).toBe('');
            expect(buildAnalyticsHead({ gtmContainerId: 'javascript:alert(1)' })).toBe('');
        });
    });

    describe('buildGtmNoscript', () => {
        it('returns the iframe for a valid GTM id', () => {
            const ns = buildGtmNoscript('GTM-ABC1234');
            expect(ns).toContain('ns.html?id=GTM-ABC1234');
        });
        it('returns empty for invalid/missing id', () => {
            expect(buildGtmNoscript(undefined)).toBe('');
            expect(buildGtmNoscript('bogus')).toBe('');
        });
    });

    describe('sanitizeCustomHead', () => {
        it('passes through legitimate head tags', () => {
            const out = sanitizeCustomHead('<meta name="x" content="y">');
            expect(out).toBe('<meta name="x" content="y">');
        });
        it('returns empty for blank input', () => {
            expect(sanitizeCustomHead(undefined)).toBe('');
            expect(sanitizeCustomHead('   ')).toBe('');
        });
        it('strips document-structure breakouts', () => {
            const out = sanitizeCustomHead('<meta name="x"><html evil</head><body>');
            expect(out).not.toContain('</head>');
            expect(out).not.toContain('</body>');
            expect(out).not.toContain('<html evil');
        });
    });
});
