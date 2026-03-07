/**
 * Trigger Node Schemas — manual, webhook, schedule, data change
 */
import type { NodeSchema, SelectFieldDefinition } from './types';

export const manualTriggerSchema: NodeSchema = {
    type: 'trigger',
    label: 'Manual Trigger',
    description: 'Start workflow manually',
    category: 'triggers',
    inputs: [],
    outputs: [
        { name: 'payload', type: 'object', description: 'Trigger payload data' },
    ],
};

export const webhookTriggerSchema: NodeSchema = {
    type: 'webhook_trigger',
    label: 'Webhook',
    description: 'Trigger via HTTP webhook',
    category: 'triggers',
    inputs: [
        {
            name: 'httpMethod',
            type: 'select',
            label: 'HTTP Method',
            default: 'POST',
            options: [
                { value: 'GET', label: 'GET' },
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
                { value: 'DELETE', label: 'DELETE' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'authentication',
            type: 'select',
            label: 'Authentication',
            default: 'none',
            options: [
                { value: 'none', label: 'None' },
                { value: 'header', label: 'Header Auth' },
                { value: 'basic', label: 'Basic Auth' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'headerName',
            type: 'string',
            label: 'Header Name',
            default: 'Authorization',
            showWhen: { authentication: 'header' },
        },
        {
            name: 'headerValue',
            type: 'password',
            label: 'Header Value',
            showWhen: { authentication: 'header' },
        },
        {
            name: 'username',
            type: 'string',
            label: 'Username',
            showWhen: { authentication: 'basic' },
        },
        {
            name: 'password',
            type: 'password',
            label: 'Password',
            showWhen: { authentication: 'basic' },
        },
    ],
    outputs: [
        { name: 'headers', type: 'object' },
        { name: 'query', type: 'object' },
        { name: 'body', type: 'object' },
    ],
};

export const scheduleTriggerSchema: NodeSchema = {
    type: 'schedule_trigger',
    label: 'Schedule',
    description: 'Trigger on a schedule',
    category: 'triggers',
    inputs: [
        {
            name: 'mode',
            type: 'select',
            label: 'Schedule Mode',
            default: 'interval',
            options: [
                { value: 'interval', label: 'Interval' },
                { value: 'cron', label: 'Cron Expression' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'intervalSeconds',
            type: 'number',
            label: 'Interval (seconds)',
            default: 300,
            description: 'Run every N seconds',
            showWhen: { mode: 'interval' },
        },
        {
            name: 'cronExpression',
            type: 'string',
            label: 'Cron Expression',
            placeholder: '0 */5 * * *',
            description: 'Standard cron syntax',
            showWhen: { mode: 'cron' },
        },
        {
            name: 'timezone',
            type: 'select',
            label: 'Timezone',
            default: 'UTC',
            options: [
                { value: 'UTC', label: 'UTC' },
                { value: 'America/New_York', label: 'America/New_York' },
                { value: 'Europe/London', label: 'Europe/London' },
                { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
            ],
        } as SelectFieldDefinition,
    ],
    outputs: [
        { name: 'timestamp', type: 'string' },
        { name: 'scheduledTime', type: 'string' },
    ],
};

export const dataChangeTriggerSchema: NodeSchema = {
    type: 'data_change_trigger',
    label: 'Data Change',
    description: 'Trigger when data changes',
    category: 'triggers',
    inputs: [
        {
            name: 'dataSource',
            type: 'select',
            label: 'Data Source',
            required: true,
            description: 'Select Data Source to watch',
            options: 'datasources',
        } as SelectFieldDefinition,
        {
            name: 'table',
            type: 'select',
            label: 'Table',
            required: true,
            description: 'Table to monitor for changes',
            options: 'tables',
        } as SelectFieldDefinition,
        {
            name: 'operation',
            type: 'select',
            label: 'On Operation',
            default: 'any',
            options: [
                { value: 'any', label: 'Any Change' },
                { value: 'insert', label: 'Insert' },
                { value: 'update', label: 'Update' },
                { value: 'delete', label: 'Delete' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'pollingInterval',
            type: 'number',
            label: 'Polling Interval (s)',
            default: 30,
            description: 'How often to check for changes (seconds)',
        },
    ],
    outputs: [
        { name: 'changes', type: 'array', description: 'Changed records' },
        { name: 'operation', type: 'string', description: 'What changed (insert/update/delete)' },
        { name: 'count', type: 'number', description: 'Number of changed records' },
    ],
};
