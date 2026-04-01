/**
 * Queue Integration — Provider-Agnostic Durable Message Delivery
 * 
 * Routes async workflow executions through a message queue for automatic
 * retry on failure. When a CF Worker dies mid-execution (10ms CPU limit),
 * the queue retries the request automatically.
 * 
 * Supports provider-agnostic env vars:
 *   FRONTBASE_QUEUE_PROVIDER       — "qstash" (default), future: "rabbitmq", "sqs"
 *   FRONTBASE_QUEUE_TOKEN          — Queue publish token / API key
 *   FRONTBASE_QUEUE_URL            — Queue REST URL (optional, for some providers)
 *   FRONTBASE_QUEUE_SIGNING_KEY    — Verify incoming callbacks
 *   FRONTBASE_QUEUE_NEXT_SIGNING_KEY — Key rotation support
 * 
 * Backward compatible — falls back to old env vars:
 *   QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY
 * 
 * When not configured, falls back to direct execution.
 */

import { getQueueConfig } from '../config/env.js';

let queueClient: any | null = null;
let queueInitialized = false;

/**
 * Get the queue provider name.
 */
export function getQueueProvider(): string {
    return getQueueConfig().provider || 'none';
}

/**
 * Get the queue client, or null if not configured.
 * Lazy-initializes on first call.
 */
export function getQueueClient(): any | null {
    if (queueInitialized) return queueClient;
    queueInitialized = true;

    const cfg = getQueueConfig();
    const token = cfg.token;
    const provider = cfg.provider || 'none';

    // CF Queues don't use a separate token — they use cfApiToken from the blob
    if (!token && provider !== 'cloudflare' && provider !== 'cloudflare_queues') {
        console.log('⬜ Queue: not configured (no token in FRONTBASE_QUEUE)');
        return null;
    }

    if (provider === 'qstash') {
        try {
            const { Client } = require('@upstash/qstash');
            queueClient = new Client({ token });
            console.log('🔄 Queue: QStash durable execution enabled');
            return queueClient;
        } catch {
            console.warn('⚠️ Queue: @upstash/qstash not installed, durable execution disabled');
            return null;
        }
    }

    if (provider === 'cloudflare' || provider === 'cloudflare_queues') {
        const apiToken = cfg.cfApiToken;
        const accountId = cfg.cfAccountId;
        const queueUrl = cfg.url || '';
        // Parse cfq://<queue-id> → extract queue ID
        const queueId = queueUrl.startsWith('cfq://') ? queueUrl.replace('cfq://', '') : queueUrl;

        if (!apiToken || !accountId || !queueId) {
            console.warn('⚠️ Queue: CF Queues missing cfApiToken, cfAccountId, or url in FRONTBASE_QUEUE');
            return null;
        }

        // Store CF Queue config as the "client"
        queueClient = { provider: 'cloudflare', apiToken, accountId, queueId };
        console.log(`🔄 Queue: CF Queues enabled (queue ${queueId.substring(0, 8)}...)`);
        return queueClient;
    }

    // Future: RabbitMQ, SQS, BullMQ adapters
    console.warn(`⚠️ Queue: unsupported provider "${provider}", durable execution disabled`);
    return null;
}

/**
 * Check if a queue is configured and available.
 */
export function isQueueEnabled(): boolean {
    return getQueueClient() !== null;
}

// Backward-compatible aliases
export const isQStashEnabled = isQueueEnabled;

/**
 * Publish a workflow execution to the queue for durable delivery.
 * The queue will call the destination URL and auto-retry on failure.
 *
 * @param destinationUrl - The internal execute URL
 * @param payload - Execution payload
 * @param options - Optional retry/backoff overrides from workflow settings
 * @returns Queue message ID, or null if publishing failed
 */
export async function publishExecution(
    destinationUrl: string,
    payload: {
        executionId: string;
        workflowId: string;
        parameters: Record<string, any>;
        triggerType: string;
        triggerPayload?: string;
    },
    options?: {
        retries?: number;
        backoff?: 'linear' | 'exponential';
    }
): Promise<string | null> {
    const client = getQueueClient();
    if (!client) return null;

    const provider = getQueueProvider();

    if (provider === 'qstash') {
        try {
            const result = await client.publishJSON({
                url: destinationUrl,
                body: payload,
                retries: options?.retries ?? 3,
            });
            return result.messageId || null;
        } catch (error: any) {
            console.error('[Queue] Publish failed:', error.message);
            return null;
        }
    }

    if ((provider === 'cloudflare' || provider === 'cloudflare_queues') && client?.provider === 'cloudflare') {
        try {
            const cfApi = `https://api.cloudflare.com/client/v4/accounts/${client.accountId}/queues/${client.queueId}/messages`;
            const resp = await fetch(cfApi, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${client.apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    body: JSON.stringify({ destinationUrl, payload }),
                    content_type: 'json',
                }),
            });
            if (!resp.ok) {
                const text = await resp.text();
                console.error(`[Queue] CF Queue publish failed: ${resp.status} ${text.substring(0, 200)}`);
                return null;
            }
            const data = await resp.json() as any;
            return data?.result?.messageId || 'cf-queued';
        } catch (error: any) {
            console.error('[Queue] CF Queue publish failed:', error.message);
            return null;
        }
    }

    // Future: other providers
    console.warn(`[Queue] Publishing not implemented for provider "${provider}"`);
    return null;
}

/**
 * Verify that an incoming request is from the queue provider (signature validation).
 * 
 * @param signature - The Upstash-Signature header value
 * @param body - The raw request body string
 * @returns true if the signature is valid
 */
export async function verifyQueueSignature(
    signature: string | undefined,
    _body: string
): Promise<boolean> {
    if (!signature) return false;

    const provider = getQueueProvider();

    if (provider === 'qstash') {
        // Use signing keys from FRONTBASE_QUEUE config
        const cfg = getQueueConfig();
        const currentKey = cfg.signingKey;
        const nextKey = cfg.nextSigningKey;

        if (!currentKey && !nextKey) {
            console.warn('[Queue] No signing keys configured, skipping verification');
            return true; // Allow in dev, but log warning
        }

        try {
            const { Receiver } = require('@upstash/qstash');
            const receiver = new Receiver({
                currentSigningKey: currentKey || '',
                nextSigningKey: nextKey || '',
            });
            return await receiver.verify({ signature, body: _body });
        } catch {
            return false;
        }
    }

    // CF Queues don't use external signature verification
    if (provider === 'cloudflare' || provider === 'cloudflare_queues') {
        return true;
    }

    // Future: other provider signature verification
    return false;
}

// Backward-compatible alias
export const verifyQStashSignature = verifyQueueSignature;
