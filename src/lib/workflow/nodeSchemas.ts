/**
 * Node Schemas - Central definitions for all workflow node types
 * 
 * Each schema defines inputs, outputs, and UI metadata for proper
 * configuration rendering in PropertiesPane.
 */

// ============ Input Field Types ============

export type FieldType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'select'
    | 'password'
    | 'json'
    | 'code'
    | 'keyValue'
    | 'conditionBuilder'
    | 'expression';

export interface BaseFieldDefinition {
    name: string;
    type: FieldType;
    label?: string;
    description?: string;
    required?: boolean;
    default?: any;
    placeholder?: string;
    /** Conditional visibility based on other field values */
    showWhen?: Record<string, any | any[]>;
}

export interface SelectFieldDefinition extends BaseFieldDefinition {
    type: 'select';
    options: Array<{ value: string; label: string }> | string; // string = dynamic source
}

export interface CodeFieldDefinition extends BaseFieldDefinition {
    type: 'code';
    language?: 'javascript' | 'sql' | 'json';
}

export interface KeyValueFieldDefinition extends BaseFieldDefinition {
    type: 'keyValue';
    keyPlaceholder?: string;
    valuePlaceholder?: string;
}

export type FieldDefinition =
    | BaseFieldDefinition
    | SelectFieldDefinition
    | CodeFieldDefinition
    | KeyValueFieldDefinition;

export interface OutputDefinition {
    name: string;
    type: string;
    description?: string;
}

export interface NodeSchema {
    type: string;
    label: string;
    description: string;
    category: 'triggers' | 'actions' | 'logic' | 'integrations' | 'interface';
    inputs: FieldDefinition[];
    outputs: OutputDefinition[];
}

// ============ Node Schemas ============

// --- TRIGGERS ---

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
                { value: 'PATCH', label: 'PATCH' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'path',
            type: 'string',
            label: 'Webhook Path',
            placeholder: '/my-webhook',
            description: 'Endpoint path for this webhook',
        },
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
            default: 'X-API-Key',
            showWhen: { authentication: 'header' },
        },
        {
            name: 'headerValue',
            type: 'password',
            label: 'Header Value',
            showWhen: { authentication: 'header' },
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
            name: 'intervalValue',
            type: 'number',
            label: 'Every',
            default: 5,
            showWhen: { mode: 'interval' },
        },
        {
            name: 'intervalUnit',
            type: 'select',
            label: 'Unit',
            default: 'minutes',
            showWhen: { mode: 'interval' },
            options: [
                { value: 'seconds', label: 'Seconds' },
                { value: 'minutes', label: 'Minutes' },
                { value: 'hours', label: 'Hours' },
                { value: 'days', label: 'Days' },
            ],
        } as SelectFieldDefinition,
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

// --- ACTIONS ---

export const httpRequestSchema: NodeSchema = {
    type: 'http_request',
    label: 'HTTP Request',
    description: 'Make an HTTP request',
    category: 'actions',
    inputs: [
        {
            name: 'method',
            type: 'select',
            label: 'Method',
            required: true,
            default: 'GET',
            options: [
                { value: 'GET', label: 'GET' },
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
                { value: 'DELETE', label: 'DELETE' },
                { value: 'PATCH', label: 'PATCH' },
                { value: 'HEAD', label: 'HEAD' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'url',
            type: 'string',
            label: 'URL',
            required: true,
            placeholder: 'https://api.example.com/endpoint',
        },
        {
            name: 'authentication',
            type: 'select',
            label: 'Authentication',
            default: 'none',
            options: [
                { value: 'none', label: 'None' },
                { value: 'basicAuth', label: 'Basic Auth' },
                { value: 'bearerToken', label: 'Bearer Token' },
                { value: 'headerAuth', label: 'Header Auth' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'username',
            type: 'string',
            label: 'Username',
            showWhen: { authentication: 'basicAuth' },
        },
        {
            name: 'password',
            type: 'password',
            label: 'Password',
            showWhen: { authentication: 'basicAuth' },
        },
        {
            name: 'bearerToken',
            type: 'password',
            label: 'Token',
            showWhen: { authentication: 'bearerToken' },
        },
        {
            name: 'headerAuthName',
            type: 'string',
            label: 'Header Name',
            default: 'Authorization',
            showWhen: { authentication: 'headerAuth' },
        },
        {
            name: 'headerAuthValue',
            type: 'password',
            label: 'Header Value',
            showWhen: { authentication: 'headerAuth' },
        },
        {
            name: 'sendHeaders',
            type: 'boolean',
            label: 'Send Headers',
            default: false,
        },
        {
            name: 'headers',
            type: 'keyValue',
            label: 'Headers',
            showWhen: { sendHeaders: true },
            keyPlaceholder: 'Header name',
            valuePlaceholder: 'Header value',
        } as KeyValueFieldDefinition,
        {
            name: 'sendQuery',
            type: 'boolean',
            label: 'Send Query Params',
            default: false,
        },
        {
            name: 'queryParameters',
            type: 'keyValue',
            label: 'Query Parameters',
            showWhen: { sendQuery: true },
            keyPlaceholder: 'Param name',
            valuePlaceholder: 'Param value',
        } as KeyValueFieldDefinition,
        {
            name: 'sendBody',
            type: 'boolean',
            label: 'Send Body',
            default: false,
            showWhen: { method: ['POST', 'PUT', 'PATCH'] },
        },
        {
            name: 'contentType',
            type: 'select',
            label: 'Content Type',
            default: 'json',
            showWhen: { sendBody: true },
            options: [
                { value: 'json', label: 'JSON' },
                { value: 'form-data', label: 'Form Data' },
                { value: 'x-www-form-urlencoded', label: 'URL Encoded' },
                { value: 'raw', label: 'Raw' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'body',
            type: 'json',
            label: 'JSON Body',
            showWhen: { sendBody: true, contentType: 'json' },
        },
        {
            name: 'bodyParameters',
            type: 'keyValue',
            label: 'Body Fields',
            showWhen: { sendBody: true, contentType: ['form-data', 'x-www-form-urlencoded'] },
        } as KeyValueFieldDefinition,
        {
            name: 'timeout',
            type: 'number',
            label: 'Timeout (ms)',
            default: 30000,
            description: 'Request timeout in milliseconds',
        },
    ],
    outputs: [
        { name: 'data', type: 'any', description: 'Response body' },
        { name: 'status', type: 'number', description: 'HTTP status code' },
        { name: 'headers', type: 'object', description: 'Response headers' },
    ],
};

export const transformSchema: NodeSchema = {
    type: 'transform',
    label: 'Transform',
    description: 'Transform data',
    category: 'actions',
    inputs: [
        {
            name: 'mode',
            type: 'select',
            label: 'Mode',
            default: 'expression',
            options: [
                { value: 'expression', label: 'Expression' },
                { value: 'javascript', label: 'JavaScript' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'expression',
            type: 'expression',
            label: 'Expression',
            placeholder: '{{ $input.data.field }}',
            description: 'Use {{ }} to reference data from previous nodes',
            showWhen: { mode: 'expression' },
        },
        {
            name: 'code',
            type: 'code',
            label: 'JavaScript Code',
            language: 'javascript',
            placeholder: 'return items.map(item => ({ ...item, modified: true }));',
            showWhen: { mode: 'javascript' },
        } as CodeFieldDefinition,
    ],
    outputs: [
        { name: 'data', type: 'any' },
    ],
};

export const logSchema: NodeSchema = {
    type: 'log',
    label: 'Console Log',
    description: 'Log to console',
    category: 'actions',
    inputs: [
        {
            name: 'message',
            type: 'string',
            label: 'Message',
            required: true,
            placeholder: 'Log message here',
        },
        {
            name: 'level',
            type: 'select',
            label: 'Log Level',
            default: 'info',
            options: [
                { value: 'info', label: 'Info' },
                { value: 'warn', label: 'Warning' },
                { value: 'error', label: 'Error' },
                { value: 'debug', label: 'Debug' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'includeData',
            type: 'boolean',
            label: 'Include Input Data',
            default: true,
            description: 'Log the input data alongside the message',
        },
    ],
    outputs: [
        { name: 'data', type: 'any', description: 'Pass-through input data' },
    ],
};

// --- LOGIC ---

export const conditionSchema: NodeSchema = {
    type: 'condition',
    label: 'Condition',
    description: 'Route data based on conditions',
    category: 'logic',
    inputs: [
        {
            name: 'conditions',
            type: 'conditionBuilder',
            label: 'Routing Rules',
            description: 'Add conditions to create output routes. Data flows to the first matching condition, or "else" if none match.',
            default: [
                {
                    id: 'cond-default-1',
                    name: 'Condition 1',
                    field: '',
                    operator: 'equals',
                    value: '',
                },
            ],
        },
        {
            name: 'fallbackBehavior',
            type: 'select',
            label: 'When No Match',
            default: 'else',
            description: 'What to do when no conditions match',
            options: [
                { value: 'else', label: 'Route to "else" output' },
                { value: 'stop', label: 'Stop workflow' },
                { value: 'error', label: 'Throw error' },
            ],
        } as SelectFieldDefinition,
    ],
    // Outputs are dynamic based on conditions - this is the default
    // The actual outputs will be generated from the conditions array
    outputs: [
        { name: 'Condition 1', type: 'any', description: 'First condition matches' },
        { name: 'else', type: 'any', description: 'No conditions matched' },
    ],
};

// --- INTEGRATIONS ---

export const databaseSchema: NodeSchema = {
    type: 'database',
    label: 'Database Query',
    description: 'Query a database',
    category: 'integrations',
    inputs: [
        {
            name: 'operation',
            type: 'select',
            label: 'Operation',
            default: 'executeQuery',
            options: [
                { value: 'executeQuery', label: 'Execute Query' },
                { value: 'insert', label: 'Insert' },
                { value: 'update', label: 'Update' },
                { value: 'delete', label: 'Delete' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'table',
            type: 'string',
            label: 'Table',
            placeholder: 'users',
            showWhen: { operation: ['insert', 'update', 'delete'] },
        },
        {
            name: 'query',
            type: 'code',
            label: 'SQL Query',
            language: 'sql',
            placeholder: 'SELECT * FROM users WHERE id = {{ $input.userId }}',
            showWhen: { operation: 'executeQuery' },
        } as CodeFieldDefinition,
        {
            name: 'columns',
            type: 'keyValue',
            label: 'Columns',
            showWhen: { operation: ['insert', 'update'] },
            keyPlaceholder: 'Column name',
            valuePlaceholder: 'Value',
        } as KeyValueFieldDefinition,
        {
            name: 'whereClause',
            type: 'string',
            label: 'WHERE Clause',
            placeholder: 'id = {{ $input.userId }}',
            showWhen: { operation: ['update', 'delete'] },
        },
        {
            name: 'returnData',
            type: 'boolean',
            label: 'Return Data',
            default: true,
        },
    ],
    outputs: [
        { name: 'rows', type: 'array', description: 'Query result rows' },
        { name: 'rowCount', type: 'number', description: 'Number of affected rows' },
    ],
};

// --- INTERFACE ---

export const toastSchema: NodeSchema = {
    type: 'toast',
    label: 'Show Toast',
    description: 'Show a notification toast',
    category: 'interface',
    inputs: [
        {
            name: 'title',
            type: 'string',
            label: 'Title',
            placeholder: 'Success',
        },
        {
            name: 'message',
            type: 'string',
            label: 'Message',
            required: true,
            placeholder: 'Operation completed!',
        },
        {
            name: 'variant',
            type: 'select',
            label: 'Variant',
            default: 'default',
            options: [
                { value: 'default', label: 'Default' },
                { value: 'success', label: 'Success' },
                { value: 'error', label: 'Error' },
                { value: 'warning', label: 'Warning' },
                { value: 'info', label: 'Info' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'duration',
            type: 'number',
            label: 'Duration (ms)',
            default: 5000,
            description: 'How long to show the toast (0 = persistent)',
        },
    ],
    outputs: [
        { name: 'data', type: 'any', description: 'Pass-through input data' },
    ],
};

export const redirectSchema: NodeSchema = {
    type: 'redirect',
    label: 'Redirect',
    description: 'Navigate to URL',
    category: 'interface',
    inputs: [
        {
            name: 'url',
            type: 'string',
            label: 'URL',
            required: true,
            placeholder: '/dashboard or https://example.com',
        },
        {
            name: 'mode',
            type: 'select',
            label: 'Open In',
            default: 'samePage',
            options: [
                { value: 'samePage', label: 'Same Page' },
                { value: 'newTab', label: 'New Tab' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'preserveParams',
            type: 'boolean',
            label: 'Preserve Query Params',
            default: false,
            description: 'Pass current URL params to the new page',
        },
    ],
    outputs: [],
};

export const refreshSchema: NodeSchema = {
    type: 'refresh',
    label: 'Refresh Page',
    description: 'Reload the current page',
    category: 'interface',
    inputs: [
        {
            name: 'hardRefresh',
            type: 'boolean',
            label: 'Hard Refresh',
            default: false,
            description: 'Force reload from server (bypass cache)',
        },
    ],
    outputs: [],
};

// ============ Schema Registry ============

export const nodeSchemas: Record<string, NodeSchema> = {
    // Triggers
    trigger: manualTriggerSchema,
    webhook_trigger: webhookTriggerSchema,
    schedule_trigger: scheduleTriggerSchema,
    // Actions
    http_request: httpRequestSchema,
    transform: transformSchema,
    log: logSchema,
    // Logic
    condition: conditionSchema,
    // Integrations
    database: databaseSchema,
    // Interface
    toast: toastSchema,
    redirect: redirectSchema,
    refresh: refreshSchema,
};

/**
 * Get schema for a node type
 */
export function getNodeSchema(type: string): NodeSchema | undefined {
    return nodeSchemas[type];
}

/**
 * Get default input values from schema
 */
export function getDefaultInputsFromSchema(type: string): Array<{ name: string; type: string; value?: any }> {
    const schema = nodeSchemas[type];
    if (!schema) {
        return [{ name: 'input', type: 'any' }];
    }

    return schema.inputs.map(input => ({
        name: input.name,
        type: input.type,
        value: input.default,
        description: input.description,
        required: input.required,
    }));
}

/**
 * Get default output definitions from schema
 */
export function getDefaultOutputsFromSchema(type: string): Array<{ name: string; type: string }> {
    const schema = nodeSchemas[type];
    if (!schema) {
        return [{ name: 'output', type: 'any' }];
    }

    return schema.outputs.map(output => ({
        name: output.name,
        type: output.type,
    }));
}

/**
 * Check if a field should be visible based on showWhen conditions
 */
export function isFieldVisible(
    field: FieldDefinition,
    values: Record<string, any>
): boolean {
    if (!field.showWhen) return true;

    return Object.entries(field.showWhen).every(([key, expected]) => {
        const actual = values[key];

        // Handle array of allowed values
        if (Array.isArray(expected)) {
            return expected.includes(actual);
        }

        // Handle single value comparison
        return actual === expected;
    });
}
