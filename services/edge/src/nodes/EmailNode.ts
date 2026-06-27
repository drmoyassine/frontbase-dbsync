/**
 * Email Node (Automations A3)
 *
 * Sends email using edge-local credential resolution (Resend / Mailgun).
 * Restores Edge Self-Sufficiency by removing BACKEND_URL dependency.
 *
 * Credential resolution:
 *   - Multi-tenant (community workers): getTenantSecret('integrations', tenantSlug)
 *   - Single-tenant (self-host): FRONTBASE_INTEGRATIONS env var
 *
 * Node inputs (read from node.inputs[] or upstream `inputs`):
 *   - to:        string | string[]   (required)
 *   - subject:   string              (required)
 *   - body:      string              (required)
 *   - isHtml:    boolean             (default true)
 *   - from:      string              (optional override)
 *   - fromName:  string              (optional override)
 *   - replyTo:   string              (optional)
 *   - _providerAccountId: string    (optional: specific provider account to use)
 *   - _tenantSlug: string            (tenant context for credential resolution)
 */

import { getTenantSecret } from '../config/tenantSecrets.js';

export interface EmailNodeResult {
    success: boolean;
    sent: boolean;
    messageId?: string;
    error?: string;
    provider?: string;
}

interface EmailProviderConfig {
    provider: string;
    api_key: string;
    domain?: string;  // For Mailgun
    region?: string;  // For Mailgun (us/eu)
}

/** Validate email node inputs. */
export function validateEmailNode(inputs: Record<string, any>): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];
    if (!inputs.to) errors.push('Recipient (to) is required');
    if (!inputs.subject) errors.push('Subject is required');
    if (!inputs.body) errors.push('Body is required');

    if (typeof inputs.to === 'string' && !inputs.to.includes('@')) {
        errors.push('Invalid email address');
    }
    if (Array.isArray(inputs.to)) {
        const invalid = inputs.to.filter((e: string) => typeof e !== 'string' || !e.includes('@'));
        if (invalid.length > 0) errors.push(`Invalid email addresses: ${invalid.join(', ')}`);
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Resolve email provider credentials using edge-local resolution.
 *
 * Priority order:
 *   1. Specific provider account ID if provided (_providerAccountId)
 *   2. First available email provider for the tenant
 *
 * Returns null if no credentials are available.
 */
async function resolveEmailCredentials(
    providerAccountId: string | undefined,
    tenantSlug: string | undefined
): Promise<EmailProviderConfig | null> {
    let integrations: Record<string, EmailProviderConfig> | null = null;

    // Multi-tenant: resolve from tenantSecrets
    if (tenantSlug && tenantSlug !== '_default') {
        try {
            const secret = await getTenantSecret('integrations', tenantSlug);
            integrations = secret || null;
        } catch (e) {
            console.warn(`[EmailNode] Failed to resolve tenant integrations: ${e}`);
        }
    }

    // Single-tenant: resolve from FRONTBASE_INTEGRATIONS env var
    if (!integrations && process.env.FRONTBASE_INTEGRATIONS) {
        try {
            integrations = JSON.parse(process.env.FRONTBASE_INTEGRATIONS);
        } catch (e) {
            console.warn(`[EmailNode] Failed to parse FRONTBASE_INTEGRATIONS: ${e}`);
        }
    }

    if (!integrations) {
        console.error('[EmailNode] No email provider credentials available');
        return null;
    }

    // Resolve specific provider account if requested
    if (providerAccountId && integrations[providerAccountId]) {
        return integrations[providerAccountId];
    }

    // Otherwise, use the first available email provider
    const providers = Object.values(integrations);
    const emailProvider = providers.find(p => p.provider === 'resend' || p.provider === 'mailgun');

    if (!emailProvider) {
        console.error('[EmailNode] No email provider (resend/mailgun) found in integrations');
        return null;
    }

    return emailProvider;
}

/**
 * Send an email via Resend API.
 */
async function sendViaResend(
    config: EmailProviderConfig,
    to: string[],
    subject: string,
    html: string,
    from?: string,
    fromName?: string,
    replyTo?: string
): Promise<EmailNodeResult> {
    const fromAddress = from || fromName ? `${fromName || 'Frontbase'} <${from || 'noreply@frontbase.com'}>` : undefined;

    const payload: Record<string, any> = {
        to,
        subject,
        html,
    };
    if (fromAddress) payload.from = fromAddress;
    if (replyTo) payload.reply_to = replyTo;

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.api_key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                sent: false,
                error: `Resend API error: ${response.status} - ${errorText.substring(0, 200)}`,
                provider: 'resend',
            };
        }

        const result = await response.json();
        return {
            success: true,
            sent: true,
            messageId: result.id,
            provider: 'resend',
        };
    } catch (error: any) {
        return {
            success: false,
            sent: false,
            error: error?.message || 'Failed to send email via Resend',
            provider: 'resend',
        };
    }
}

/**
 * Send an email via Mailgun API.
 */
async function sendViaMailgun(
    config: EmailProviderConfig,
    to: string[],
    subject: string,
    html: string,
    from?: string,
    fromName?: string,
    replyTo?: string
): Promise<EmailNodeResult> {
    const domain = config.domain || 'mg.frontbase.com';
    const region = config.region || 'us';
    const baseUrl = region === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3';

    // Build from address
    let fromAddress = from;
    if (fromName) {
        fromAddress = `${fromName} <${from || `postmaster@${domain}`}>`;
    }
    if (!fromAddress) {
        fromAddress = `postmaster@${domain}`;
    }

    const formData = new URLSearchParams();
    formData.append('to', to.join(','));
    formData.append('subject', subject);
    formData.append('html', html);
    formData.append('from', fromAddress);
    if (replyTo) formData.append('h:Reply-To', replyTo);

    try {
        const response = await fetch(`${baseUrl}/${domain}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${btoa(`api:${config.api_key}`)}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                sent: false,
                error: `Mailgun API error: ${response.status} - ${errorText.substring(0, 200)}`,
                provider: 'mailgun',
            };
        }

        const result = await response.json();
        return {
            success: true,
            sent: true,
            messageId: result.id || result.message,
            provider: 'mailgun',
        };
    } catch (error: any) {
        return {
            success: false,
            sent: false,
            error: error?.message || 'Failed to send email via Mailgun',
            provider: 'mailgun',
        };
    }
}

/** Send an email using edge-local credential resolution. */
export async function executeEmailNode(inputs: Record<string, any>): Promise<EmailNodeResult> {
    const { to, subject, body } = inputs;
    if (!to) return { success: false, sent: false, error: 'Recipient (to) is required' };
    if (!subject) return { success: false, sent: false, error: 'Subject is required' };
    if (!body) return { success: false, sent: false, error: 'Body is required' };

    const isHtml = inputs.isHtml !== false;
    const html = isHtml ? body : `<p>${body}</p>`;
    const recipients = Array.isArray(to) ? to : [to];
    const tenantSlug = inputs._tenantSlug;
    const providerAccountId = inputs._providerAccountId;

    // Resolve email provider credentials
    const config = await resolveEmailCredentials(providerAccountId, tenantSlug);
    if (!config) {
        return {
            success: false,
            sent: false,
            error: 'No email provider credentials available. Configure an email provider in the integrations tab.',
        };
    }

    console.log(`[EmailNode] Sending email via ${config.provider} to ${recipients.length} recipient(s)`);

    // Dispatch to provider-specific implementation
    if (config.provider === 'resend') {
        return await sendViaResend(
            config,
            recipients,
            subject,
            html,
            inputs.from,
            inputs.fromName,
            inputs.replyTo
        );
    } else if (config.provider === 'mailgun') {
        return await sendViaMailgun(
            config,
            recipients,
            subject,
            html,
            inputs.from,
            inputs.fromName,
            inputs.replyTo
        );
    }

    return {
        success: false,
        sent: false,
        error: `Unsupported email provider: ${config.provider}`,
    };
}
