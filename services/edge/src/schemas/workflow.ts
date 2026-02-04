/**
 * Zod Schemas for Actions Engine API
 * 
 * These define the contract for all API requests/responses.
 * Used for both validation and OpenAPI generation.
 */

import { z } from '@hono/zod-openapi';

// ============ Enums ============

export const TriggerTypeSchema = z.enum([
    'manual',
    'http_webhook',
    'scheduled',
    'data_change',
]).openapi('TriggerType');

export const ExecutionStatusSchema = z.enum([
    'started',
    'executing',
    'completed',
    'error',
    'cancelled',
]).openapi('ExecutionStatus');

export const NodeExecutionStatusSchema = z.enum([
    'idle',
    'executing',
    'completed',
    'error',
    'skipped',
]).openapi('NodeExecutionStatus');

// ============ Base Types ============

export const NodePositionSchema = z.object({
    x: z.number(),
    y: z.number(),
}).openapi('NodePosition');

export const ParameterSchema = z.object({
    name: z.string(),
    type: z.string(),
    value: z.any().optional().nullable(),
    description: z.string().optional().nullable(),
    required: z.boolean().optional().nullable(),
}).passthrough().openapi('Parameter');

export const WorkflowNodeSchema = z.object({
    id: z.string(),
    // ReactFlow uses 'type' at root level
    type: z.string(),
    position: NodePositionSchema,
    // ReactFlow wraps node data in 'data' object
    data: z.object({
        label: z.string().optional().nullable(),
        type: z.string().optional().nullable(),
        inputs: z.array(ParameterSchema).optional().nullable(),
        outputs: z.array(ParameterSchema).optional().nullable(),
    }).passthrough().optional().nullable(),
    // Legacy format: direct properties (for backward compatibility)
    name: z.string().optional().nullable(),
    inputs: z.array(ParameterSchema).optional().nullable(),
    outputs: z.array(ParameterSchema).optional().nullable(),
    error: z.string().optional().nullable(),
}).passthrough().openapi('WorkflowNode');

export const WorkflowEdgeSchema = z.object({
    id: z.string().optional(), // ReactFlow adds id
    source: z.string(),
    target: z.string(),
    // ReactFlow uses sourceHandle/targetHandle
    sourceHandle: z.string().nullable().optional(),
    targetHandle: z.string().nullable().optional(),
    // Legacy format
    sourceOutput: z.string().optional(),
    targetInput: z.string().optional(),
}).passthrough().openapi('WorkflowEdge');

// ============ Workflow ============

export const WorkflowSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    triggerType: TriggerTypeSchema,
    triggerConfig: z.record(z.any()).optional(),
    nodes: z.array(WorkflowNodeSchema),
    edges: z.array(WorkflowEdgeSchema),
    version: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
}).openapi('Workflow');

export const DeployWorkflowSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().optional(),
    triggerType: TriggerTypeSchema,
    triggerConfig: z.record(z.any()).optional(),
    nodes: z.array(WorkflowNodeSchema),
    edges: z.array(WorkflowEdgeSchema),
    publishedBy: z.string().optional(),
}).openapi('DeployWorkflow');

// ============ Execution ============

export const NodeExecutionSchema = z.object({
    nodeId: z.string(),
    status: NodeExecutionStatusSchema,
    outputs: z.record(z.any()).optional(),
    error: z.string().optional(),
    usage: z.number().optional(),
}).openapi('NodeExecution');

export const ExecutionSchema = z.object({
    id: z.string().uuid(),
    workflowId: z.string().uuid(),
    status: ExecutionStatusSchema,
    triggerType: TriggerTypeSchema,
    triggerPayload: z.record(z.any()).optional(),
    nodeExecutions: z.array(NodeExecutionSchema).optional(),
    result: z.record(z.any()).optional(),
    error: z.string().optional(),
    usage: z.number().optional(),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().optional(),
}).openapi('Execution');

// ============ Request/Response ============

export const ExecuteRequestSchema = z.object({
    parameters: z.record(z.any()).optional(),
}).openapi('ExecuteRequest');

export const ExecuteResponseSchema = z.object({
    executionId: z.string().uuid(),
    status: ExecutionStatusSchema,
    message: z.string().optional(),
}).openapi('ExecuteResponse');

export const WebhookPayloadSchema = z.object({
    event: z.string().optional(),
    data: z.record(z.any()),
    timestamp: z.string().datetime().optional(),
}).openapi('WebhookPayload');

export const ErrorResponseSchema = z.object({
    error: z.string(),
    message: z.string(),
    details: z.any().optional(),
}).openapi('ErrorResponse');

export const SuccessResponseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
}).openapi('SuccessResponse');

// ============ Type Exports ============

export type TriggerType = z.infer<typeof TriggerTypeSchema>;
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;
export type NodeExecutionStatus = z.infer<typeof NodeExecutionStatusSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type DeployWorkflow = z.infer<typeof DeployWorkflowSchema>;
export type Execution = z.infer<typeof ExecutionSchema>;
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;
