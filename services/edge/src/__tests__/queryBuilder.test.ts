/**
 * Phase 2 — queryBuilder tests + filter-semantics conformance vectors.
 *
 * These vectors are the single source of truth for filter→SQL mapping; the
 * PL/pgSQL `frontbase__build_where` path must satisfy the same semantics.
 * Guards: values are ALWAYS parameters (never interpolated) → no SQL injection.
 */

import { describe, it, expect } from 'vitest';
import { buildWhere, buildRowsQuery, buildAggregateQuery } from '../db/queryBuilder';
import type { WireFilter, RowsQuery, AggregateQuery } from '@frontbase/types';

function where(filters: WireFilter[], dialect: 'mysql' | 'sqlite') {
    return buildWhere(filters, dialect);
}

describe('buildWhere — parameterization & injection safety', () => {
    it('never interpolates values (mysql uses ? placeholders)', () => {
        const { clause, params } = where([{ column: 'name', op: 'eq', value: "'; DROP TABLE users; --" }], 'mysql');
        expect(clause).toContain('?');
        expect(clause).not.toContain('DROP TABLE');
        expect(params).toEqual(["'; DROP TABLE users; --"]);
    });

    it('quotes identifiers (sqlite uses ") and $N placeholders)', () => {
        const { clause, params } = where([{ column: 'evil"col', op: 'eq', value: 1 }], 'sqlite');
        expect(clause).not.toContain('"evil"col"'); // no breakout
        expect(clause).toContain('$1');
        expect(params).toEqual([1]);
    });

    it('returns empty clause for empty filters', () => {
        expect(where([], 'mysql')).toEqual({ clause: '', params: [] });
    });
});

describe('buildWhere — operator conformance (mysql)', () => {
    const cases: Array<[string, WireFilter, RegExp]> = [
        ['eq', { column: 'a', op: 'eq', value: 1 }, /CAST\(`a` AS CHAR\) = \?/],
        ['gt', { column: 'a', op: 'gt', value: 1 }, /`a` > \?/],
        ['gte', { column: 'a', op: 'gte', value: 1 }, /`a` >= \?/],
        ['lt', { column: 'a', op: 'lt', value: 1 }, /`a` < \?/],
        ['lte', { column: 'a', op: 'lte', value: 1 }, /`a` <= \?/],
        ['contains', { column: 'a', op: 'contains', value: 'x' }, /CAST\(`a` AS CHAR\) LIKE \?/],
        ['neq', { column: 'a', op: 'neq', value: 1 }, /`a` IS DISTINCT FROM \?/],
        ['is_null', { column: 'a', op: 'is_null' }, /`a` IS NULL/],
        ['not_null', { column: 'a', op: 'not_null' }, /`a` IS NOT NULL/],
    ];
    for (const [name, f, expected] of cases) {
        it(`${name} → ${expected}`, () => {
            expect(where([f], 'mysql').clause).toMatch(expected);
        });
    }

    it('contains wraps value with %...%', () => {
        expect(where([{ column: 'a', op: 'contains', value: 'x' }], 'mysql').params).toEqual(['%x%']);
    });

    it('in expands to N placeholders', () => {
        const { clause, params } = where([{ column: 'a', op: 'in', value: [1, 2, 3] }], 'mysql');
        expect(clause).toMatch(/IN \(\?, \?, \?\)/);
        expect(params).toEqual([1, 2, 3]);
    });

    it('in accepts comma-separated string', () => {
        const { params } = where([{ column: 'a', op: 'in', value: 'x,y' }], 'mysql');
        expect(params).toEqual(['x', 'y']);
    });

    it('booleans coerce to 1/0', () => {
        expect(where([{ column: 'a', op: 'eq', value: true }], 'mysql').params).toEqual([1]);
    });

    it('joins multiple filters with AND', () => {
        const { clause } = where([{ column: 'a', op: 'eq', value: 1 }, { column: 'b', op: 'gt', value: 2 }], 'mysql');
        expect(clause).toContain('AND');
    });
});

describe('buildWhere — sqlite dialect', () => {
    it('uses $N placeholders and " quoting', () => {
        const { clause } = where([{ column: 'a', op: 'eq', value: 1 }], 'sqlite');
        expect(clause).toMatch(/CAST\("a" AS TEXT\) = \$1/);
    });
});

describe('buildRowsQuery', () => {
    const q: RowsQuery = {
        kind: 'rows', table: 'users', columns: '"users"."id","users"."name"',
        filters: [{ column: 'active', op: 'eq', value: true }],
        sort: { column: 'id', direction: 'desc' }, page: 2, pageSize: 25,
    };

    it('builds SELECT + WHERE + ORDER + LIMIT/OFFSET (mysql)', () => {
        const { sql, params } = buildRowsQuery(q, 'mysql');
        expect(sql).toContain('SELECT "users"."id","users"."name" FROM `users`');
        expect(sql).toContain('WHERE');
        expect(sql).toContain('ORDER BY `id` DESC');
        expect(sql).toMatch(/LIMIT \? OFFSET \?/);
        // params: [active(1), pageSize(25), offset(50)]
        expect(params).toEqual([1, 25, 50]);
    });

    it('computes offset from page*pageSize', () => {
        const { params } = buildRowsQuery({ ...q, page: 0, pageSize: 10 }, 'mysql');
        expect(params[params.length - 1]).toBe(0); // offset
    });
});

describe('buildAggregateQuery', () => {
    const q: AggregateQuery = {
        kind: 'aggregate', table: 'orders', category: 'status', aggregation: 'sum',
        value: 'amount', filters: [], sort: 'desc', limit: 5,
    };

    it('builds GROUP BY with SUM(amount)', () => {
        const { sql, params } = buildAggregateQuery(q, 'mysql');
        expect(sql).toContain('GROUP BY `status`');
        expect(sql).toContain('SUM(CAST(`amount` AS DECIMAL(65,4)))');
        expect(sql).toContain('ORDER BY value DESC');
        expect(sql).toMatch(/LIMIT \?/);
        expect(params).toEqual([5]);
    });

    it('count needs no value column', () => {
        const { sql } = buildAggregateQuery({ ...q, aggregation: 'count' }, 'mysql');
        expect(sql).toContain('COUNT(*)');
    });
});
