/**
 * Inbound Email Webhooks Route (Automations A11)
 *
 * Receives inbound-email webhooks from SendGrid / Mailgun / Resend, normalizes
 * them via engine/emailParsers.ts, then fires any active `email_trigger`
 * workflow(s) for the tenant whose watched address matches the recipient.
 *
 * Verification: each provider is expected to be configured to post a shared
 * secret (x-webhook-secret) matching FRONTBASE_EMAIL_WEBHOOK_SECRET. If that env
 * is unset, the route is open (dev only) — logged loudly.
 */

import { Hono } from 'hono';
import { stateProvider } from '../storage/index.js';
import { parseInboundEmail } from '../engine/emailParsers.js';
import { v4 as uuidv4 } from 'uuid';
import { ipRateLimiter } from '../middleware/rateLimit.js';
import { executeWorkflow } from '../engine/runtime.js';

export const emailWebhooksRoute = new Hono();
emailWebhooksRoute.use('*', ipRateLimiter);

type Provider = 'sendgrid' | 'mailgun' | 'resend';

function expectedSecret(): string | null {
    const s = process.env.FRONTBASE_EMAIL_WEBHOOK_SECRET;
    return s && s.length > 0 ? s : null;
}

/**
 * POST /:provider — inbound email webhook.
 * Body shape is provider-specific (see emailParsers.ts).
 */
emailWebhooksRoute.post('/:provider', async (c) => {
    const providerRaw = c.req.param('provider').toLowerCase();
    if (!['sendgrid', 'mailgun', 'resend'].includes(providerRaw)) {
        return c.json({ error: 'Unknown provider' }, 400);
    }
    const provider = providerRaw as Provider;

    // Shared-secret verification (when configured).
    const secret = expectedSecret();
    if (secret) {
        const provided = c.req.header('x-webhook-secret') || c.req.query('secret');
        if (provided !== secret) {
            return c.json({ error: 'Unauthorized' }, 401);
        }
    } else {
        console.warn('[EmailWebhook] FRONTBASE_EMAIL_WEBHOOK_SECRET unset — inbound email route is OPEN (dev only)');
    }

    let body: Record<string, any>;
    try {
        body = await c.req.json();
    } catch {
        // Some providers post form-encoded data; best-effort parse.
        try {
            body = Object.fromEntries(await c.req.formData());
        } catch {
            return c.json({ error: 'Invalid body' }, 400);
        }
    }

    let parsed;
    try {
        parsed = parseInboundEmail(provider, body);
    } catch (e: any) {
        return c.json({ error: 'ParseError', message: e.message }, 400);
    }

    const tenantSlug = (c.get as any)('tenantSlug') || '_default';

    // Find active email_trigger workflows for this tenant whose watched address
    // matches (or any, if no address filter is configured).
    const workflows = await stateProvider.listWorkflows(tenantSlug);
    const matching = workflows.filter((w) => {
        if (!w.isActive) return false;
        const types = (w.triggerType || '').split(',').map((t) => t.trim().toLowerCase());
        if (!types.includes('email_trigger') && !types.includes('email')) return false;
        // Optional address match from triggerConfig.
        try {
            const cfg = w.triggerConfig ? JSON.parse(w.triggerConfig) : {};
            const watched = (cfg.address || cfg.email || '').toLowerCase();
            if (watched) {
                return parsed.to.toLowerCase().includes(watched);
            }
        } catch {
            // ignore malformed config — treat as match-all
        }
        return true;
    });

    if (matching.length === 0) {
        return c.json({ received: true, dispatched: 0, message: 'No matching email_trigger workflow' }, 200);
    }

    const executionIds: string[] = [];
    for (const workflow of matching) {
        const executionId = uuidv4();
        const now = new Date().toISOString();
        const settings = workflow.settings ? JSON.parse(workflow.settings) : {};

        await stateProvider.createExecution({
            id: executionId,
            workflowId: workflow.id,
            status: 'started',
            triggerType: 'email_trigger',
            triggerPayload: JSON.stringify(parsed),
            startedAt: now,
        });

        // Fire-and-forget execution.
        executeWorkflow(executionId, workflow, parsed as any, settings).catch((err) =>
            console.error(`[EmailWebhook] Execution ${executionId} failed:`, err),
        );
        executionIds.push(executionId);
    }

    return c.json({ received: true, dispatched: matching.length, executionIds }, 200);
});
