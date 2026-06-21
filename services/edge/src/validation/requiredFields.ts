/**
 * Backend Required-Field Validation — Sprint 2
 *
 * Validates submitted record data against a column schema. Used by the edge
 * runtime / API layer to enforce required fields server-side, independent of
 * the browser's HTML5 validation. Pure and fully unit-testable.
 */

export interface BackendColumn {
    name: string;
    type: string | string[];
    nullable: boolean;
    primary_key?: boolean;
}

export interface RecordValidationError {
    field: string;
    message: string;
}

export interface RecordValidationResult {
    valid: boolean;
    errors: RecordValidationError[];
}

function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || value === '' ||
        (Array.isArray(value) && value.length === 0);
}

function isRequired(column: BackendColumn): boolean {
    if (column.primary_key) return false;
    return !column.nullable;
}

function getSqlType(column: BackendColumn): string {
    return (typeof column.type === 'string' ? column.type : column.type[0] || '').toLowerCase();
}

/**
 * Validate a single field.
 */
export function validateRecordField(value: unknown, column: BackendColumn): string | null {
    if (isEmpty(value)) {
        return isRequired(column) ? 'This field is required' : null;
    }

    const sqlType = getSqlType(column);

    if (sqlType.includes('int') || sqlType.includes('decimal') || sqlType.includes('numeric') ||
        sqlType.includes('float') || sqlType.includes('double')) {
        if (isNaN(Number(value))) return `Must be a number`;
    }

    if (sqlType.includes('bool') || sqlType === 'tinyint(1)') {
        if (typeof value !== 'boolean' && !['true', 'false', '0', '1', 0, 1].includes(value as never)) {
            return 'Must be true or false';
        }
    }

    if (column.name.toLowerCase().includes('email')) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
            return 'Enter a valid email address';
        }
    }

    return null;
}

/**
 * Validate an entire record against a column schema.
 */
export function validateRecord(
    record: Record<string, unknown>,
    columns: BackendColumn[]
): RecordValidationResult {
    const errors: RecordValidationError[] = [];

    for (const column of columns) {
        const error = validateRecordField(record[column.name], column);
        if (error) {
            errors.push({ field: column.name, message: error });
        }
    }

    return { valid: errors.length === 0, errors };
}
