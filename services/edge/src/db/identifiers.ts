/**
 * SQL identifier helpers (Sprint 3E — column projection).
 *
 * Column projection passes caller-supplied column / table names into SQL. SQL
 * identifiers can't be bind parameters (only values can), so we validate them
 * against a strict allow-list regex and reject anything that could break out of
 * the identifier position — semicolons, quotes, comments, whitespace, etc.
 *
 * This hardens the projection path that the optimized-fetch work (select only
 * requested columns instead of `*`) opened up to caller-controlled names.
 */

// Letters, digits, underscore; must start with a letter/underscore; ≤64 chars
// (Postgres identifier limit). Rejects `*`, spaces, quotes, semicolons, etc.
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/**
 * Validate a single SQL identifier (table or column name).
 * Throws on anything that is not a plain identifier.
 */
export function sanitizeIdentifier(name: string, kind = 'identifier'): string {
    if (typeof name !== 'string' || !IDENT_RE.test(name)) {
        throw new Error(`Invalid SQL ${kind}: ${JSON.stringify(String(name).slice(0, 50))}`);
    }
    return name;
}

/**
 * Sanitize a list of column names for projection.
 *
 * Returns `['*']` when no columns are requested (preserves the existing
 * "select everything" default). A literal `'*'` is only allowed as the sole
 * element; otherwise every entry must be a valid identifier.
 */
export function sanitizeColumns(columns?: string[]): string[] {
    if (!columns || columns.length === 0) return ['*'];
    if (columns.length === 1 && columns[0] === '*') return ['*'];
    return columns.map((c) => sanitizeIdentifier(c, 'column'));
}

/** True if `name` is a safe SQL identifier (no throw). */
export function isValidIdentifier(name: unknown): name is string {
    return typeof name === 'string' && IDENT_RE.test(name);
}
