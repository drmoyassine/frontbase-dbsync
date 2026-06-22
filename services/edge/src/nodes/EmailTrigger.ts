/**
 * Email Received Trigger Node (Automations A11)
 *
 * Fires a workflow when an inbound email is received (via SendGrid / Mailgun /
 * Resend inbound parse — see routes/emailWebhooks.ts + engine/emailParsers.ts).
 * Normalizes the parsed email payload into trigger node outputs.
 */

export interface EmailTriggerResult {
    from: string;
    to: string;
    subject: string;
    body: string;
    text?: string;
    attachments: any[];
    headers: Record<string, string>;
    timestamp: string;
    provider?: string;
    messageId?: string;
}

/** Normalize a parsed inbound email into trigger node outputs. */
export function executeEmailTrigger(inputs: Record<string, any>): EmailTriggerResult {
    return {
        from: inputs.from || '',
        to: inputs.to || '',
        subject: inputs.subject || '(no subject)',
        body: inputs.body || inputs.html || inputs.text || '',
        text: inputs.text,
        attachments: Array.isArray(inputs.attachments) ? inputs.attachments : [],
        headers: inputs.headers || {},
        timestamp: inputs.timestamp || new Date().toISOString(),
        provider: inputs.provider,
        messageId: inputs.messageId,
    };
}
