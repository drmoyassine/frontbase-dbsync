/**
 * Phase 2 — proxy-sql + proxy-rpc fulfillment tests (mocked fetch + creds).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { executeProxySql, __setDatasourcesCacheForTests as setSql } from '../engine/proxySql';
import { executeProxyRpc, __buildCallForTests, __setDatasourcesCacheForTests as setRpc } from '../engine/proxyRpc';
import type { RowsQuery, AggregateQuery } from '@frontbase/types';

const rowsQuery: RowsQuery = {
    kind: 'rows', table: 'users', columns: '*',
    filters: [{ column: 'active', op: 'eq', value: true }],
    sort: { column: 'id', direction: 'asc' }, page: 0, pageSize: 10,
};

const aggQuery: AggregateQuery = {
    kind: 'aggregate', table: 'orders', category: 'status', aggregation: 'count',
    filters: [], sort: 'desc', limit: 5,
};

function mockFetch(responseBody: unknown, status = 200) {
    const calls: any[] = [];
    const fetchImpl: any = async (url: string, init: any) => {
        calls.push({ url, init });
        return { ok: status < 400, status, json: async () => responseBody };
    };
    return { fetchImpl, calls };
}

beforeEach(() => {
    const creds = {
        'ds-mysql': { type: 'mysql', httpUrl: 'https://db.example.com', apiKey: 'tok' },
        'ds-neon': { type: 'neon', httpUrl: 'https://neon.example.com', apiKey: 'npk' },
    };
    setSql(creds);
    setRpc(creds);
});

describe('executeProxySql (mysql)', () => {
    it('builds parameterized SQL and POSTs to /query', async () => {
        const { fetchImpl, calls } = mockFetch({ rows: [{ id: 1 }, { id: 2 }] });
        const result = await executeProxySql(
            { datasourceId: 'ds-mysql', body: { query: rowsQuery } },
            { fetchImpl }
        );
        expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
        const { url, init } = calls[0];
        expect(url).toBe('https://db.example.com/query');
        expect(init.headers.Authorization).toBe('Bearer tok');
        const body = JSON.parse(init.body);
        expect(body.query).toContain('FROM `users`');
        expect(body.query).toContain('WHERE');
        expect(body.query).toContain('LIMIT ?');
        expect(Array.isArray(body.params)).toBe(true);
        // boolean coerced, value is a parameter not interpolated
        expect(body.params).toContain(1);
    });

    it('builds aggregate SQL', async () => {
        const { fetchImpl, calls } = mockFetch({ rows: [{ category: 'open', value: 3 }] });
        await executeProxySql({ datasourceId: 'ds-mysql', body: { query: aggQuery } }, { fetchImpl });
        const body = JSON.parse(calls[0].init.body);
        expect(body.query).toContain('GROUP BY `status`');
        expect(body.query).toContain('COUNT(*)');
    });

    it('throws on missing datasourceId', async () => {
        await expect(executeProxySql({ body: { query: rowsQuery } })).rejects.toThrow(/missing datasourceId/);
    });

    it('throws on non-query body', async () => {
        await expect(executeProxySql({ datasourceId: 'ds-mysql', body: {} })).rejects.toThrow(/RowsQuery or AggregateQuery/);
    });
});

describe('executeProxyRpc (neon)', () => {
    it('builds a parameterized frontbase_get_rows call', () => {
        const call = __buildCallForTests(rowsQuery);
        expect(call.sql).toMatch(/^SELECT \* FROM frontbase_get_rows\(\$1, \$2/);
        expect(call.params[0]).toBe('users'); // table
        expect(call.params[5]).toBe(1); // 1-based page
    });

    it('builds frontbase_aggregate for aggregate queries', () => {
        const call = __buildCallForTests(aggQuery);
        expect(call.sql).toMatch(/^SELECT \* FROM frontbase_aggregate\(/);
    });

    it('POSTs the call to /sql and maps {rows,total}', async () => {
        const { fetchImpl, calls } = mockFetch({ rows: [{ id: 1 }], total: 1 });
        const result = await executeProxyRpc(
            { datasourceId: 'ds-neon', body: { query: rowsQuery } },
            { fetchImpl }
        );
        expect(result.data).toEqual([{ id: 1 }]);
        expect(result.total).toBe(1);
        const { url, init } = calls[0];
        expect(url).toBe('https://neon.example.com/sql');
        expect(init.headers.Authorization).toBe('Bearer npk');
        const body = JSON.parse(init.body);
        expect(body.query).toContain('frontbase_get_rows');
        expect(Array.isArray(body.params)).toBe(true);
    });

    it('maps aggregate arrays', async () => {
        const { fetchImpl } = mockFetch([{ category: 'open', value: 3 }]);
        const result = await executeProxyRpc({ datasourceId: 'ds-neon', body: { query: aggQuery } }, { fetchImpl });
        expect(result.data).toEqual([{ category: 'open', value: 3 }]);
        expect(result.total).toBeNull();
    });
});
