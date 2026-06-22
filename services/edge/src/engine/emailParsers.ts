/**
 * Inbound Email Parsers (Automations A11)
 *
 * Normalize inbound-email webhook payloads from SendGrid / Mailgun / Resend into
 * a single shape consumed by the email_trigger node (nodes/EmailTrigger.ts).
 *
 * Each provider posts a different form. These parsers accept the already-parsed
 * body (the route handler is responsible for JSON/form decoding) and return a
 * normalized object.
 */

export interface ParsedEmail {
    from: string;
    to: string;
    subject: string;
    body: string; // HTML body (preferred)
    text?: string;
    attachments: Array<{ filename: string; contentType?: string; size?: number; url?: string }>;
    headers: Record<string, string>;
    timestamp: string;
    provider: 'sendgrid' | 'mailgun' | 'resend';
    messageId?: string;
}

function safeString(v: any): string {
    return v === undefined || v === null ? '' : String(v);
}

/**
 * Parse a SendGrid Inbound Parse webhook payload.
 * SendGrid posts fields: from, to, subject, html, text, attachments, etc.
 */
export function parseSendgridInbound(body: Record<string, any>): ParsedEmail {
    const attachments = Array.isArray(body.attachments)
        ? body.attachments.map((a: any) => ({
              filename: safeString(a.filename || a.name),
              contentType: a.type || a.contentType,
              size: a.size,
              url: a.url,
          }))
        : [];

    return {
        from: safeString(body.from),
        to: safeString(body.to),
        subject: safeString(body.subject),
        body: safeString(body.html),
        text: safeString(body.text) || undefined,
        attachments,
        headers: body.headers || {},
        timestamp: safeString(body['sendgrid-inbound']) || new Date().toISOString(),
        provider: 'sendgrid',
        messageId: body['message-id'] || body.messageId,
    };
}

/**
 * Parse a Mailgun inbound webhook payload.
 * Mailgun posts: sender, recipient, subject, body-plain, body-html, etc.
 */
export function parseMailgunInbound(body: Record<string, any>): ParsedEmail {
    const attachmentUrls: Array<{ filename: string; url?: string; contentType?: string; size?: number }> = [];
    if (body['attachment-count'] && body['attachment-1']) {
        const count = parseInt(safeString(body['attachment-count']), 10) || 0;
        for (let i = 1; i <= count; i++) {
            const att = body[`attachment-${i}`];
            attachmentUrls.push({
                filename: typeof att === 'string' ? att : safeString(att?.filename),
                url: typeof att === 'object' ? att?.url : undefined,
            });
        }
    }

    return {
        from: safeString(body.sender || body.from),
        to: safeString(body.recipient || body.to),
        subject: safeString(body.subject),
        body: safeString(body['body-html'] || body['stripped-html']),
        text: safeString(body['body-plain'] || body['stripped-text']) || undefined,
        attachments: attachmentUrls,
        headers: body['message-headers'] ? normalizeMailgunHeaders(body['message-headers']) : {},
        timestamp: safeString(body.timestamp) || new Date().toISOString(),
        provider: 'mailgun',
        messageId: body['Message-Id'] || body.messageId,
    };
}

function normalizeMailgunHeaders(raw: any): Record<string, string> {
    // Mailgun sends message-headers as an array of [name, value] pairs.
    const out: Record<string, string> = {};
    if (Array.isArray(raw)) {
        for (const pair of raw) {
            if (Array.isArray(pair) && pair.length === 2) {
                out[safeString(pair[0])] = safeString(pair[1]);
            }
        }
    }
    return out;
}

/**
 * Parse a Resend inbound email webhook payload.
 * Resend posts a structured JSON object: from, to, subject, html, text, attachments.
 */
export function parseResendInbound(body: Record<string, any>): ParsedEmail {
    const attachments = Array.isArray(body.attachments)
        ? body.attachments.map((a: any) => ({
              filename: safeString(a.filename || a.name),
              contentType: a.contentType || a.type,
              size: a.size,
              url: a.url,
          }))
        : [];

    return {
        from: safeString(body.from),
        to: Array.isArray(body.to) ? body.to.join(', ') : safeString(body.to),
        subject: safeString(body.subject),
        body: safeString(body.html),
        text: safeString(body.text) || undefined,
        attachments,
        headers: body.headers || {},
        timestamp: safeString(body.created_at || body.timestamp) || new Date().toISOString(),
        provider: 'resend',
        messageId: body.id || body.messageId,
    };
}

/**
 * Dispatch to the right parser based on provider name.
 */
export function parseInboundEmail(
    provider: 'sendgrid' | 'mailgun' | 'resend',
    body: Record<string, any>,
): ParsedEmail {
    switch (provider) {
        case 'sendgrid':
            return parseSendgridInbound(body);
        case 'mailgun':
            return parseMailgunInbound(body);
        case 'resend':
            return parseResendInbound(body);
        default:
            throw new Error(`Unknown email inbound provider: ${provider}`);
    }
}
