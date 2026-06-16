/**
 * Resolves variables in a template string on the client using the global VariableStore.
 */
export function resolveClientTemplate(template: string, store: { get(scope: string, key: string): any }): string {
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr) => {
        const [scope, ...rest] = String(expr).trim().split('.');
        const val = store.get(scope, rest.join('.'));
        return val !== undefined && val !== null ? String(val) : '';
    });
}
