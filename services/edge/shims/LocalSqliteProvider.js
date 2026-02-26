/**
 * LocalSqliteProvider stub for Cloudflare Workers.
 * 
 * CF Workers don't support local SQLite (`file:` URLs).
 * This stub is aliased in via tsup.cloudflare-lite.ts / tsup.cloudflare.ts
 * esbuild plugin to prevent the real LocalSqliteProvider from being bundled.
 * 
 * IMPORTANT: This stub must NOT throw. CF Workers run module-level code
 * at upload validation time, before env vars are bridged. If the stub
 * throws, the upload fails. Instead, it returns empty/default values.
 * 
 * When the real fetch() handler runs, env vars are bridged and
 * runStartupSync() calls upgradeToTurso(), which hot-swaps to the
 * real TursoHttpProvider.
 */
export class LocalSqliteProvider {
    _isStub = true;

    constructor() {
        // No-op. Do NOT throw here — CF module evaluation will trigger this.
        console.warn('[LocalSqliteProvider] Stub initialized — will be replaced by TursoHttpProvider on first request.');
    }
    async init() { }
    async initSettings() { }
    async upsertPage() { return { success: false, version: 0 }; }
    async getPageBySlug() { return null; }
    async getHomepage() { return null; }
    async deletePage() { return false; }
    async listPages() { return []; }
    async getProjectSettings() { return { id: 'default', faviconUrl: null, logoUrl: null, siteName: null, siteDescription: null, appUrl: null, updatedAt: '' }; }
    async getFaviconUrl() { return '/static/icon.png'; }
    async updateProjectSettings() { return this.getProjectSettings(); }
    async upsertWorkflow() { return { version: 0 }; }
    async getWorkflowById() { return null; }
    async getActiveWebhookWorkflow() { return null; }
    async createExecution() { }
    async getExecutionById() { return null; }
    async updateExecution() { }
    async listExecutionsByWorkflow() { return []; }
    async getExecutionStats() { return []; }
}
