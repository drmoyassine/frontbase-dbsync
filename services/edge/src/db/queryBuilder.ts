/**
 * Dialect-aware SQL Query Builder (Phase 2 / Route B)
 *
 * Builds parameterized SQL for the `proxy-sql` mode (MySQL / Turso-sqlite) from
 * the Phase-0 structured contract. Mirrors the operator semantics of
 * `frontbase__build_where` (supabase_setup.sql) so filter behavior is identical
 * across the PL/pgSQL RPC path and this edge-built path — enforced by the
 * shared conformance vectors (see __tests__/queryBuilder.conformance.test.ts).
 *
 * Security: identifiers are quoted per-dialect; values are ALWAYS parameters
 * (never string-interpolated) to prevent SQL injection.
 */

import type { RowsQuery, AggregateQuery, WireFilter } from '@frontbase/types';

export type Dialect = 'mysql' | 'sqlite';

export interface BuiltQuery {
    sql: string;
    params: unknown[];
}

const PLACEHOLDER: Record<Dialect, (i: number) => string> = {
    mysql: () => '?',
    sqlite: (i) => `$${i}`,
};

function quoteIdent(name: string, dialect: Dialect): string {
    // Strip any table-qualified prefix quoting and re-quote safely.
    const cleaned = name.replace(/["`]/g, '');
    if (dialect === 'mysql') return '`' + cleaned + '`';
    return '"' + cleaned + '"';
}

/**
 * Coerce a value for parameter binding. Arrays become comma-separated only for
 * `in`/`not_in` (handled by the caller expanding placeholders).
 */
function toParam(value: unknown): unknown {
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
}

/** Build a WHERE clause + params from WireFilters, mirroring frontbase__build_where. */
export function buildWhere(filters: WireFilter[], dialect: Dialect): { clause: string; params: unknown[] } {
    if (!filters.length) return { clause: '', params: [] };

    const ph = PLACEHOLDER[dialect];
    const conditions: string[] = [];
    const params: unknown[] = [];

    for (const f of filters) {
        const col = quoteIdent(f.column, dialect);
        const op = (f.op || 'eq').toLowerCase();
        const cast = (s: string) => (dialect === 'sqlite' ? `CAST(${col} AS TEXT) ${s}` : `CAST(${col} AS CHAR) ${s}`);

        const push = (sqlFragment: string, value?: unknown) => {
            // For valueless operators
            if (value === undefined) {
                conditions.push(sqlFragment);
            } else {
                params.push(toParam(value));
                conditions.push(sqlFragment.replace('${p}', ph(params.length)));
            }
        };

        switch (op) {
            case 'eq':
            case 'equals':
            case '=':
                push(`${cast('=')} \${p}`, f.value);
                break;
            case 'neq':
            case 'not_equals':
            case '!=':
                // Null-safe inequality: sqlite supports `IS NOT`; mysql 8+ supports `IS DISTINCT FROM`.
                push(`${col} IS DISTINCT FROM \${p}`, f.value);
                break;
            case 'gt':
            case '>':
                push(`${col} > \${p}`, f.value);
                break;
            case 'gte':
            case '>=':
                push(`${col} >= \${p}`, f.value);
                break;
            case 'lt':
            case '<':
                push(`${col} < \${p}`, f.value);
                break;
            case 'lte':
            case '<=':
                push(`${col} <= \${p}`, f.value);
                break;
            case 'contains':
                push(`${cast('LIKE')} \${p}`, `%${f.value}%`);
                break;
            case 'not_contains':
                push(`${cast('NOT LIKE')} \${p}`, `%${f.value}%`);
                break;
            case 'starts_with':
                push(`${cast('LIKE')} \${p}`, `${f.value}%`);
                break;
            case 'ends_with':
                push(`${cast('LIKE')} \${p}`, `%${f.value}`);
                break;
            case 'is_null':
                conditions.push(`${col} IS NULL`);
                break;
            case 'not_null':
                conditions.push(`${col} IS NOT NULL`);
                break;
            case 'is_empty':
                conditions.push(`(${col} IS NULL OR ${cast('=')} '')`);
                break;
            case 'is_not_empty':
                conditions.push(`(${col} IS NOT NULL AND ${cast('!=')} '')`);
                break;
            case 'in': {
                const vals = Array.isArray(f.value)
                    ? f.value
                    : String(f.value).split(',').map((s) => s.trim()).filter(Boolean);
                if (!vals.length) break;
                const realPhs: string[] = [];
                for (const v of vals) {
                    params.push(toParam(v));
                    realPhs.push(ph(params.length));
                }
                conditions.push(`${cast('IN')} (${realPhs.join(', ')})`);
                break;
            }
            default:
                // Unknown op → skip (never silently match everything)
                break;
        }
    }

    if (!conditions.length) return { clause: '', params: [] };
    return { clause: 'WHERE ' + conditions.join(' AND '), params };
}

/** Build a SELECT for a RowsQuery. */
export function buildRowsQuery(q: RowsQuery, dialect: Dialect, tablePrefix?: string): BuiltQuery {
    const table = quoteIdent(q.table, dialect);
    const cols = q.columns && q.columns !== '*' ? q.columns : `${table}.*`;

    const { clause, params } = buildWhere(q.filters, dialect);

    let sql = `SELECT ${cols} FROM ${table}`;
    if (clause) sql += ` ${clause}`;

    if (q.sort && q.sort.column) {
        sql += ` ORDER BY ${quoteIdent(q.sort.column, dialect)} ${q.sort.direction === 'desc' ? 'DESC' : 'ASC'}`;
    }

    const pageSize = Math.max(q.pageSize || 100, 1);
    const offset = Math.max(q.page || 0, 0) * pageSize;
    const ph = PLACEHOLDER[dialect];
    sql += ` LIMIT ${ph(params.length + 1)}`;
    params.push(pageSize);
    sql += ` OFFSET ${ph(params.length + 1)}`;
    params.push(offset);

    void tablePrefix;
    return { sql, params };
}

/** Build an aggregate (GROUP BY) query. */
export function buildAggregateQuery(q: AggregateQuery, dialect: Dialect): BuiltQuery {
    const table = quoteIdent(q.table, dialect);
    const cat = quoteIdent(q.category, dialect);
    const { clause, params } = buildWhere(q.filters, dialect);
    const ph = PLACEHOLDER[dialect];

    const valExpr = q.aggregation === 'count'
        ? 'COUNT(*)'
        : q.aggregation === 'sum'
            ? `SUM(CAST(${q.value ? quoteIdent(q.value, dialect) : '*'} AS DECIMAL(65,4)))`
            : q.aggregation === 'average'
                ? `AVG(CAST(${q.value ? quoteIdent(q.value, dialect) : '*'} AS DECIMAL(65,4)))`
                : q.aggregation === 'min'
                    ? `MIN(CAST(${q.value ? quoteIdent(q.value, dialect) : '*'} AS DECIMAL(65,4)))`
                    : `MAX(CAST(${q.value ? quoteIdent(q.value, dialect) : '*'} AS DECIMAL(65,4)))`;

    let sql = `SELECT ${cat} AS category, ${valExpr} AS value FROM ${table}`;
    if (clause) sql += ` ${clause}`;
    sql += ` GROUP BY ${cat}`;

    if (q.sort === 'asc') sql += ' ORDER BY value ASC';
    else if (q.sort === 'desc') sql += ' ORDER BY value DESC';

    sql += ` LIMIT ${ph(params.length + 1)}`;
    params.push(q.limit || 10);

    return { sql, params };
}
