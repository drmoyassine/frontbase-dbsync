import { describe, it, expect } from 'vitest';
import { sanitizeIdentifier, sanitizeColumns, isValidIdentifier } from '../db/identifiers.js';

describe('SQL identifier sanitization (Sprint 3E)', () => {
    describe('sanitizeIdentifier', () => {
        it('accepts plain identifiers', () => {
            expect(sanitizeIdentifier('users')).toBe('users');
            expect(sanitizeIdentifier('school_id')).toBe('school_id');
            expect(sanitizeIdentifier('_hidden')).toBe('_hidden');
            expect(sanitizeIdentifier('col123')).toBe('col123');
        });

        it('rejects SQL-injection attempts', () => {
            expect(() => sanitizeIdentifier('col; DROP TABLE users')).toThrow();
            expect(() => sanitizeIdentifier("a' OR '1'='1")).toThrow();
            expect(() => sanitizeIdentifier('col--comment')).toThrow();
            expect(() => sanitizeIdentifier('col"quote')).toThrow();
            expect(() => sanitizeIdentifier('col space')).toThrow();
            expect(() => sanitizeIdentifier('*')).toThrow();
            expect(() => sanitizeIdentifier('')).toThrow();
        });
    });

    describe('sanitizeColumns', () => {
        it('returns ["*"] when no columns requested', () => {
            expect(sanitizeColumns(undefined)).toEqual(['*']);
            expect(sanitizeColumns([])).toEqual(['*']);
        });

        it('passes a sole "*" through', () => {
            expect(sanitizeColumns(['*'])).toEqual(['*']);
        });

        it('validates a column list', () => {
            expect(sanitizeColumns(['id', 'name', 'school_id'])).toEqual(['id', 'name', 'school_id']);
        });

        it('rejects a malicious column in a list', () => {
            expect(() => sanitizeColumns(['id', "name'; DROP--"])).toThrow();
        });
    });

    describe('isValidIdentifier', () => {
        it('is a type guard', () => {
            expect(isValidIdentifier('ok')).toBe(true);
            expect(isValidIdentifier('bad name')).toBe(false);
            expect(isValidIdentifier(42)).toBe(false);
            expect(isValidIdentifier(null)).toBe(false);
        });
    });
});
