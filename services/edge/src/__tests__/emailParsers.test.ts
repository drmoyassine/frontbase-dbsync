import { describe, it, expect } from 'vitest';
import {
    parseSendgridInbound,
    parseMailgunInbound,
    parseResendInbound,
    parseInboundEmail,
} from '../engine/emailParsers.js';

describe('Email Parsers', () => {
    describe('parseSendgridInbound', () => {
        it('normalizes a SendGrid inbound payload', () => {
            const result = parseSendgridInbound({
                from: 'sender@example.com',
                to: 'inbox@frontbase.dev',
                subject: 'Hello',
                html: '<p>Hi there</p>',
                text: 'Hi there',
                attachments: [{ filename: 'doc.pdf', type: 'application/pdf', size: 1234 }],
                headers: { 'X-Mailer': 'sendgrid' },
                'message-id': '<abc@sendgrid>',
            });

            expect(result.provider).toBe('sendgrid');
            expect(result.from).toBe('sender@example.com');
            expect(result.to).toBe('inbox@frontbase.dev');
            expect(result.subject).toBe('Hello');
            expect(result.body).toBe('<p>Hi there</p>');
            expect(result.text).toBe('Hi there');
            expect(result.attachments).toHaveLength(1);
            expect(result.attachments[0].filename).toBe('doc.pdf');
            expect(result.messageId).toBe('<abc@sendgrid>');
        });

        it('handles sparse payloads', () => {
            const result = parseSendgridInbound({});
            expect(result.from).toBe('');
            expect(result.attachments).toEqual([]);
            expect(result.timestamp).toBeDefined();
        });
    });

    describe('parseMailgunInbound', () => {
        it('normalizes a Mailgun inbound payload', () => {
            const result = parseMailgunInbound({
                sender: 'a@b.com',
                recipient: 'inbox@frontbase.dev',
                subject: 'MG subject',
                'body-plain': 'plain text',
                'body-html': '<b>html</b>',
                'attachment-count': '1',
                'attachment-1': 'file.csv',
                'message-headers': [['X-Test', 'yes'], ['X-Two', 'no']],
                timestamp: '1700000000',
            });

            expect(result.provider).toBe('mailgun');
            expect(result.from).toBe('a@b.com');
            expect(result.to).toBe('inbox@frontbase.dev');
            expect(result.body).toBe('<b>html</b>');
            expect(result.text).toBe('plain text');
            expect(result.attachments).toHaveLength(1);
            expect(result.attachments[0].filename).toBe('file.csv');
            expect(result.headers).toEqual({ 'X-Test': 'yes', 'X-Two': 'no' });
        });
    });

    describe('parseResendInbound', () => {
        it('normalizes a Resend inbound payload', () => {
            const result = parseResendInbound({
                from: 'r@b.com',
                to: ['inbox@frontbase.dev', 'cc@frontbase.dev'],
                subject: 'Resend',
                html: '<i>resend html</i>',
                text: 'resend text',
                attachments: [{ filename: 'a.txt', contentType: 'text/plain' }],
                id: 'resend-id',
                created_at: '2024-01-01T00:00:00Z',
            });

            expect(result.provider).toBe('resend');
            expect(result.from).toBe('r@b.com');
            expect(result.to).toContain('inbox@frontbase.dev');
            expect(result.to).toContain('cc@frontbase.dev');
            expect(result.body).toBe('<i>resend html</i>');
            expect(result.messageId).toBe('resend-id');
            expect(result.timestamp).toBe('2024-01-01T00:00:00Z');
        });
    });

    describe('parseInboundEmail (dispatcher)', () => {
        it('dispatches to the correct parser', () => {
            expect(parseInboundEmail('sendgrid', { from: 'a' }).provider).toBe('sendgrid');
            expect(parseInboundEmail('mailgun', { sender: 'a' }).provider).toBe('mailgun');
            expect(parseInboundEmail('resend', { from: 'a' }).provider).toBe('resend');
        });

        it('throws on unknown provider', () => {
            expect(() => parseInboundEmail('postmark' as any, {})).toThrow('Unknown');
        });
    });
});
