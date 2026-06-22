/**
 * Queue Trigger Node (Automations A10)
 *
 * Fires a workflow when a message lands on a watched queue. The trigger
 * payload (message body + metadata) is supplied by the queue consumer
 * (execution/queueConsumer.ts) and normalized here into node outputs.
 *
 * Node outputs:
 *   - message:    the raw message body
 *   - messageId:  provider message id (for idempotency)
 *   - queueName:  the source queue
 *   - timestamp:  receipt time
 */

export interface QueueTriggerResult {
    message: any;
    messageId?: string;
    queueName?: string;
    timestamp: string;
}

/** Normalize an inbound queue message into trigger node outputs. */
export function executeQueueTrigger(inputs: Record<string, any>): QueueTriggerResult {
    return {
        message: inputs.message ?? inputs.data ?? inputs,
        messageId: inputs.messageId ?? inputs.id,
        queueName: inputs.queueName ?? inputs.queue,
        timestamp: inputs.timestamp ?? new Date().toISOString(),
    };
}
