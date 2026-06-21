/**
 * Backend Required-Field Validation Tests — Sprint 2
 */

import { describe, it, expect } from 'vitest';
import { validateRecord, validateRecordField } from '../../validation/requiredFields';
import type { BackendColumn } from '../../validation/requiredFields';

const col = (over: Partial<BackendColumn>): BackendColumn => ({
    name: 'x',
    type: 'varchar(255)',
    nullable: true,
    ...over,
});

describe('validateRecordField', () => {
    it('flags empty required fields', () => {
        expect(validateRecordField('', col({ name: 'title', nullable: false }))).toBe('This field is required');
    });
    it('allows empty optional fields', () => {
        expect(validateRecordField('', col({ name: 'title', nullable: true }))).toBeNull();
    });
    it('validates integers', () => {
        expect(validateRecordField('abc', col({ name: 'qty', type: 'int', nullable: true }))).toContain('number');
        expect(validateRecordField('7', col({ name: 'qty', type: 'int', nullable: true }))).toBeNull();
    });
    it('validates email columns', () => {
        expect(validateRecordField('nope', col({ name: 'email', nullable: true }))).toContain('email');
    });
    it('primary keys are never required', () => {
        expect(validateRecordField('', col({ name: 'id', primary_key: true, nullable: false }))).toBeNull();
    });
});

describe('validateRecord', () => {
    it('returns valid when all required fields are present', () => {
        const columns = [
            col({ name: 'name', nullable: false }),
            col({ name: 'email', nullable: true }),
        ];
        const r = validateRecord({ name: 'Bob', email: 'b@c.com' }, columns);
        expect(r.valid).toBe(true);
        expect(r.errors).toHaveLength(0);
    });

    it('collects all errors', () => {
        const columns = [
            col({ name: 'name', nullable: false }),
            col({ name: 'qty', type: 'int', nullable: false }),
        ];
        const r = validateRecord({ name: '', qty: 'abc' }, columns);
        expect(r.valid).toBe(false);
        expect(r.errors.map(e => e.field)).toEqual(['name', 'qty']);
    });
});
