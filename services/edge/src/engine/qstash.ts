/**
 * QStash Integration — Durable Message Delivery
 * 
 * Routes async workflow executions through Upstash QStash for automatic
 * retry on failure. When a CF Worker dies mid-execution (10ms CPU limit),
 * QStash retries the request automatically (3x, exponential backoff).
 * 
 * Combined with checkpoints (checkpoint.ts), this enables fully durable
 * workflow execution: Worker dies → QStash retries → checkpoint resumes.
 * 
 * Requires env vars:
 *   QSTASH_TOKEN                — Publish token
 *   QSTASH_CURRENT_SIGNING_KEY  — Verify incoming callbacks
 *   QSTASH_NEXT_SIGNING_KEY     — Key rotation support
 * 
 * When not configured, falls back to direct execution (current behavior).
 */

let qstashClient: any | null = null;
let qstashInitialized = false;

/**
 * Get the QStash client, or null if not configured.
 * Lazy-initializes on first call.
 */
export function getQStashClient(): any | null {
    if (qstashInitialized) return qstashClient;
    qstashInitialized = true;

    const token = process.env.QSTASH_TOKEN;
    if (!token) {
        console.log('⬜ QStash: not configured (no QSTASH_TOKEN)');
        return null;
    }

    try {
        // Dynamic import to avoid bundling when not used
        const { Client } = require('@upstash/qstash');
        qstashClient = new Client({ token });
        console.log('🔄 QStash: durable execution enabled');
        return qstashClient;
    } catch {
        console.warn('⚠️ QStash: @upstash/qstash not installed, durable execution disabled');
        return null;
    }
}

/**
 * Check if QStash is configured and available.
 */
export function isQStashEnabled(): boolean {
    return getQStashClient() !== null;
}

/**
 * Publish a workflow execution to QStash for durable delivery.
 * QStash will call the destination URL and auto-retry on failure.
 * 
 * @param destinationUrl - The internal execute URL (e.g., https://edge.workers.dev/api/_internal/execute)
 * @param payload - Execution payload { executionId, workflowId, parameters }
 * @returns QStash message ID, or null if publishing failed
 */
export async function publishExecution(
    destinationUrl: string,
    payload: {
        executionId: string;
        workflowId: string;
        parameters: Record<string, any>;
        triggerType: string;
        triggerPayload?: string;
    }
): Promise<string | null> {
    const client = getQStashClient();
    if (!client) return null;

    try {
        const result = await client.publishJSON({
            url: destinationUrl,
            body: payload,
            retries: 3,
        });
        return result.messageId || null;
    } catch (error: any) {
        console.error('[QStash] Publish failed:', error.message);
        return null;
    }
}

/**
 * Verify that an incoming request is from QStash (signature validation).
 * Uses the signing keys to verify the request signature.
 * 
 * @param signature - The Upstash-Signature header value
 * @param body - The raw request body string
 * @returns true if the signature is valid
 */
export async function verifyQStashSignature(
    signature: string | undefined,
    _body: string
): Promise<boolean> {
    if (!signature) return false;

    const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

    if (!currentKey && !nextKey) {
        // No signing keys configured — can't verify
        console.warn('[QStash] No signing keys configured, skipping verification');
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
