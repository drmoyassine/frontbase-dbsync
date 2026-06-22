/**
 * Email Node (Automations A3)
 *
 * Sends email via the FastAPI backend email service (Resend / Mailgun).
 * Tenant + provider routing is resolved server-side; no credentials reach the edge.
 *
 * Node inputs (read from node.inputs[] or upstream `inputs`):
 *   - to:        string | string[]   (required)
 *   - subject:   string              (required)
 *   - body:      string              (required)
 *   - isHtml:    boolean             (default true)
 *   - from:      string              (optional override)
 *   - fromName:  string              (optional override)
 *   - replyTo:   string              (optional)
 *
 * Tenant routing keys (passed through by the workflow runtime):
 *   - _tenantSlug, _providerAccountId, _projectId
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export interface EmailNodeResult {
    success: boolean;
    sent: boolean;
    messageId?: string;
    error?: string;
    provider?: string;
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

/** Send an email via the backend service. */
export async function executeEmailNode(inputs: Record<string, any>): Promise<EmailNodeResult> {
    const { to, subject, body } = inputs;
    if (!to) return { success: false, sent: false, error: 'Recipient (to) is required' };
    if (!subject) return { success: false, sent: false, error: 'Subject is required' };
    if (!body) return { success: false, sent: false, error: 'Body is required' };

    const isHtml = inputs.isHtml !== false;
    const payload: Record<string, any> = {
        to: Array.isArray(to) ? to : [to],
        subject,
        html: isHtml ? body : `<p>${body}</p>`,
    };
    if (inputs.from) payload.from_email = inputs.from;
    if (inputs.fromName) payload.from_name = inputs.fromName;
    if (inputs.replyTo) payload.reply_to = inputs.replyTo;

    try {
        const url = new URL(`${BACKEND_URL}/api/workflows/send-email`);
        if (inputs._tenantSlug) url.searchParams.set('tenant_slug', inputs._tenantSlug);
        if (inputs._providerAccountId) url.searchParams.set('provider_account_id', inputs._providerAccountId);
        if (inputs._projectId) url.searchParams.set('project_id', inputs._projectId);

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                sent: false,
                error: `Email service error: ${response.status} - ${errorText.substring(0, 200)}`,
            };
        }

        const result = await response.json();
        return {
            success: result.success ?? false,
            sent: result.success ?? false,
            messageId: result.message_id,
            error: result.error,
            provider: result.provider,
        };
    } catch (error: any) {
        return { success: false, sent: false, error: error?.message || 'Failed to send email' };
    }
}
