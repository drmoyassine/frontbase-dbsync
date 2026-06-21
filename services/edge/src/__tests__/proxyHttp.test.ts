/**
 * Phase 1 — proxy-http fulfillment tests.
 * Uses an injected fetch + injected credential cache (no Redis, no network).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { executeProxyHttp, __setDatasourcesCacheForTests } from '../engine/proxyHttp';

// Force the `cached()` wrapper to bypass Redis (not configured in tests) → direct run.
beforeEach(() => {
    __setDatasourcesCacheForTests({
        'ds-sheets': {
            type: 'google_sheets',
            webAppUrl: 'https://script.google.com/macros/s/FAKE/exec',
            webAppSecret: 's3cr3t',
            spreadsheetId: 'sh-1',
        },
    });
});

function mockFetch(responseBody: unknown, status = 200) {
    const calls: any[] = [];
    const fetchImpl: any = async (url: string, init: any) => {
        calls.push({ url, init });
        return {
            ok: status < 400,
            status,
            json: async () => responseBody,
        };
    };
    return { fetchImpl, calls };
}

describe('executeProxyHttp — rows', () => {
    it('POSTs the contract to the Web App and returns rows + total', async () => {
        const { fetchImpl, calls } = mockFetch({ rows: [{ id: 1 }, { id: 2 }], total: 2 });

        const result = await executeProxyHttp(
            { datasourceId: 'ds-sheets', body: { action: 'rows', query: { kind: 'rows', table: 'Sheet1', filters: [], page: 0, pageSize: 25 } } },
            { fetchImpl }
        );

        expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
        expect(result.total).toBe(2);

        const { url, init } = calls[0];
        expect(url).toBe('https://script.google.com/macros/s/FAKE/exec');
        expect(init.method).toBe('POST');
        const body = JSON.parse(init.body);
        expect(body.secret).toBe('s3cr3t');
        expect(body.action).toBe('rows');
        expect(body.query.table).toBe('Sheet1');
    });

    it('infers the rows action from a query.kind when no explicit action', async () => {
        const { fetchImpl, calls } = mockFetch({ rows: [], total: 0 });
        await executeProxyHttp(
            { datasourceId: 'ds-sheets', body: { query: { kind: 'rows', table: 't', filters: [], page: 0, pageSize: 10 } } },
            { fetchImpl }
        );
        expect(JSON.parse(calls[0].init.body).action).toBe('rows');
    });

    it('maps aggregate responses to an array', async () => {
        const { fetchImpl } = mockFetch([{ category: 'open', value: 3 }]);
        const result = await executeProxyHttp(
            { datasourceId: 'ds-sheets', body: { action: 'aggregate', query: { kind: 'aggregate', table: 't', category: 'status', aggregation: 'count', filters: [], sort: 'none', limit: 10 } } },
            { fetchImpl }
        );
        expect(result.data).toEqual([{ category: 'open', value: 3 }]);
        expect(result.total).toBeNull();
    });
});

describe('executeProxyHttp — writes', () => {
    it('forwards insert payloads', async () => {
        const { fetchImpl, calls } = mockFetch({ inserted: 2 });
        await executeProxyHttp(
            { datasourceId: 'ds-sheets', body: { action: 'insert', table: 'Sheet1', records: [{ a: 1 }] } },
            { fetchImpl }
        );
        const body = JSON.parse(calls[0].init.body);
        expect(body.action).toBe('insert');
        expect(body.table).toBe('Sheet1');
        expect(body.records).toEqual([{ a: 1 }]);
    });

    it('forwards update/delete match + patch', async () => {
        const upd = mockFetch({ updated: 1 });
        await executeProxyHttp(
            { datasourceId: 'ds-sheets', body: { action: 'update', table: 't', match: { key: 'id', value: 5 }, patch: { status: 'done' } } },
            { fetchImpl: upd.fetchImpl }
        );
        expect(JSON.parse(upd.calls[0].init.body).patch).toEqual({ status: 'done' });

        const del = mockFetch({ deleted: 1 });
        await executeProxyHttp(
            { datasourceId: 'ds-sheets', body: { action: 'delete', table: 't', match: { key: 'id', value: 5 } } },
            { fetchImpl: del.fetchImpl }
        );
        expect(JSON.parse(del.calls[0].init.body).match).toEqual({ key: 'id', value: 5 });
    });
});

describe('executeProxyHttp — errors', () => {
    it('throws when datasourceId is missing', async () => {
        await expect(executeProxyHttp({ body: {} })).rejects.toThrow(/missing datasourceId/);
    });

    it('throws when no credentials are configured', async () => {
        __setDatasourcesCacheForTests({});
        await expect(executeProxyHttp({ datasourceId: 'none', body: {} })).rejects.toThrow(/no credentials/);
    });

    it('throws when credentials lack a webAppUrl', async () => {
        __setDatasourcesCacheForTests({ 'ds-x': { type: 'google_sheets', webAppSecret: 's' } });
        await expect(executeProxyHttp({ datasourceId: 'ds-x', body: {} })).rejects.toThrow(/no webAppUrl/);
    });

    it('surfaces non-2xx Web App responses', async () => {
        const { fetchImpl } = mockFetch({ error: 'boom' }, 500);
        await expect(
            executeProxyHttp({ datasourceId: 'ds-sheets', body: { action: 'rows', query: { kind: 'rows', table: 't', filters: [], page: 0, pageSize: 10 } } }, { fetchImpl })
        ).rejects.toThrow(/Web App returned 500/);
    });
});
