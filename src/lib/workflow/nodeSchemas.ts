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
    | 'columnKeyValue'
    | 'conditionBuilder'
    | 'expression'
    | 'fieldMapping';

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

export interface ColumnKeyValueFieldDefinition extends BaseFieldDefinition {
    type: 'columnKeyValue';
    keyPlaceholder?: string;
    valuePlaceholder?: string;
}

export type FieldDefinition =
    | BaseFieldDefinition
    | SelectFieldDefinition
    | CodeFieldDefinition
    | KeyValueFieldDefinition
    | ColumnKeyValueFieldDefinition;

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
    description: 'Manipulate and reshape data',
    category: 'actions',
    inputs: [
        {
            name: 'operation',
            type: 'select',
            label: 'Operation',
            default: 'setFields',
            options: [
                { value: 'setFields', label: 'Set Fields' },
                { value: 'extractField', label: 'Extract Field' },
                { value: 'renameFields', label: 'Rename Fields' },
                { value: 'keepFields', label: 'Keep Only Fields' },
                { value: 'removeFields', label: 'Remove Fields' },
                { value: 'filterItems', label: 'Filter Items' },
                { value: 'sortItems', label: 'Sort Items' },
                { value: 'limitItems', label: 'Limit Items' },
                { value: 'customCode', label: 'Custom Code' },
            ],
        } as SelectFieldDefinition,

        // Set Fields - add or override fields
        {
            name: 'fieldsToSet',
            type: 'keyValue',
            label: 'Fields to Set',
            description: 'Add or update fields with values or expressions',
            showWhen: { operation: 'setFields' },
            keyPlaceholder: 'fieldName',
            valuePlaceholder: '{{ $input.data.value }} or static value',
        } as KeyValueFieldDefinition,

        // Extract Field - get a specific nested value
        {
            name: 'extractPath',
            type: 'string',
            label: 'Field Path',
            placeholder: 'user.profile.name',
            description: 'Dot notation path to extract (e.g., items[0].id)',
            showWhen: { operation: 'extractField' },
        },

        // Rename Fields
        {
            name: 'fieldsToRename',
            type: 'keyValue',
            label: 'Rename Fields',
            description: 'Map old field names to new names',
            showWhen: { operation: 'renameFields' },
            keyPlaceholder: 'oldFieldName',
            valuePlaceholder: 'newFieldName',
        } as KeyValueFieldDefinition,

        // Keep Only Fields
        {
            name: 'fieldsToKeep',
            type: 'string',
            label: 'Fields to Keep',
            placeholder: 'id, name, email',
            description: 'Comma-separated list of fields to keep',
            showWhen: { operation: 'keepFields' },
        },

        // Remove Fields
        {
            name: 'fieldsToRemove',
            type: 'string',
            label: 'Fields to Remove',
            placeholder: 'password, __internal',
            description: 'Comma-separated list of fields to remove',
            showWhen: { operation: 'removeFields' },
        },

        // Filter Items
        {
            name: 'filterField',
            type: 'string',
            label: 'Filter Field',
            placeholder: 'status',
            showWhen: { operation: 'filterItems' },
        },
        {
            name: 'filterOperator',
            type: 'select',
            label: 'Condition',
            default: 'equals',
            showWhen: { operation: 'filterItems' },
            options: [
                { value: 'equals', label: 'Equals' },
                { value: 'notEquals', label: 'Not Equals' },
                { value: 'contains', label: 'Contains' },
                { value: 'greaterThan', label: 'Greater Than' },
                { value: 'lessThan', label: 'Less Than' },
                { value: 'isEmpty', label: 'Is Empty' },
                { value: 'isNotEmpty', label: 'Is Not Empty' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'filterValue',
            type: 'string',
            label: 'Value',
            placeholder: 'active',
            showWhen: { operation: 'filterItems' },
        },

        // Sort Items
        {
            name: 'sortField',
            type: 'string',
            label: 'Sort By Field',
            placeholder: 'createdAt',
            showWhen: { operation: 'sortItems' },
        },
        {
            name: 'sortOrder',
            type: 'select',
            label: 'Order',
            default: 'asc',
            showWhen: { operation: 'sortItems' },
            options: [
                { value: 'asc', label: 'Ascending (A-Z, 0-9)' },
                { value: 'desc', label: 'Descending (Z-A, 9-0)' },
            ],
        } as SelectFieldDefinition,

        // Limit Items
        {
            name: 'limitCount',
            type: 'number',
            label: 'Max Items',
            default: 10,
            description: 'Maximum number of items to keep',
            showWhen: { operation: 'limitItems' },
        },
        {
            name: 'skipCount',
            type: 'number',
            label: 'Skip First',
            default: 0,
            description: 'Number of items to skip (for pagination)',
            showWhen: { operation: 'limitItems' },
        },

        // Custom Code (advanced)
        {
            name: 'code',
            type: 'code',
            label: 'JavaScript Code',
            language: 'javascript',
            placeholder: '// Access input via $input\nreturn $input.data.map(item => ({\n  ...item,\n  processed: true\n}));',
            description: 'Write custom JavaScript for complex transformations',
            showWhen: { operation: 'customCode' },
        } as CodeFieldDefinition,
    ],
    outputs: [
        { name: 'data', type: 'any', description: 'Transformed data' },
        { name: 'count', type: 'number', description: 'Number of items (if array)' },
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

export const dataRequestSchema: NodeSchema = {
    type: 'data_request',
    label: 'Data Request',
    description: 'Query or modify data from a data source',
    category: 'integrations',
    inputs: [
        {
            name: 'dataSource',
            type: 'select',
            label: 'Data Source',
            required: true,
            description: 'Select Data Source',
            options: 'datasources', // Dynamic - will be populated from configured data sources
        } as SelectFieldDefinition,
        {
            name: 'table',
            type: 'select',
            label: 'Table',
            required: true,
            description: 'Select a table from the data source',
            options: 'tables', // Dynamic - will be populated based on selected data source
        } as SelectFieldDefinition,
        {
            name: 'operation',
            type: 'select',
            label: 'Operation',
            default: 'select',
            options: [
                { value: 'select', label: 'Select (Read)' },
                { value: 'insert', label: 'Insert (Create)' },
                { value: 'update', label: 'Update' },
                { value: 'delete', label: 'Delete' },
                { value: 'executeQuery', label: 'Execute Query (SQL)' },
            ],
        } as SelectFieldDefinition,
        // Select operation options
        {
            name: 'selectFields',
            type: 'columnKeyValue',
            label: 'Fields to Select',
            description: 'Leave empty to select all fields (*)',
            showWhen: { operation: 'select' },
            keyPlaceholder: 'Column name',
            valuePlaceholder: 'Alias (optional)',
        },
        {
            name: 'whereConditions',
            type: 'columnKeyValue',
            label: 'WHERE Conditions',
            showWhen: { operation: ['select', 'update', 'delete'] },
            keyPlaceholder: 'Column',
            valuePlaceholder: 'Value or {{ expression }}',
        },
        {
            name: 'orderBy',
            type: 'string',
            label: 'Order By',
            placeholder: 'column_name ASC',
            showWhen: { operation: 'select' },
        },
        {
            name: 'limit',
            type: 'number',
            label: 'Limit',
            placeholder: '100',
            showWhen: { operation: 'select' },
        },
        // Insert/Update field mappings
        {
            name: 'fieldMappings',
            type: 'fieldMapping',
            label: 'Field Mappings',
            description: 'Map input data to table columns',
            showWhen: { operation: ['insert', 'update'] },
        },
        // Execute Query (raw SQL)
        {
            name: 'query',
            type: 'code',
            label: 'SQL Query',
            language: 'sql',
            placeholder: 'SELECT * FROM users WHERE id = {{ $input.userId }}',
            description: 'Raw SQL query (only available if data source supports SQL)',
            showWhen: { operation: 'executeQuery' },
        } as CodeFieldDefinition,
        // Common options
        {
            name: 'returnData',
            type: 'boolean',
            label: 'Return Result Data',
            default: true,
            description: 'Include query results in output',
        },
    ],
    outputs: [
        { name: 'data', type: 'array', description: 'Query result rows' },
        { name: 'rowCount', type: 'number', description: 'Number of affected/returned rows' },
        { name: 'success', type: 'boolean', description: 'Operation success status' },
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
    data_request: dataRequestSchema,
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
