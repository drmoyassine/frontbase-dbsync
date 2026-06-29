/**
 * RAG Service — Main entry point for storage-aware RAG.
 *
 * Re-exports all RAG functionality:
 * - Config: Bucket/folder-level RAG configuration
 * - Processor: Document indexing with metadata extraction
 * - Search: Metadata-filtered semantic search
 * - Vector Adapter: Direct vector store access (edge self-sufficiency)
 */

export * from './config.js';
export * from './processor.js';
export * from './vector-adapter.js';

/**
 * RAG Service singleton for managing RAG operations.
 * Uses direct storage and vector adapters (no backend API calls).
 */
import { RagDocumentProcessor, searchRagDocuments, type RagSearchOptions } from './processor.js';
import type { RagSourceConfig, RagIndexJob } from './config.js';

export class RagService {
    private processor: RagDocumentProcessor;

    constructor() {
        // No backend URL or API key needed - uses direct adapters
        this.processor = new RagDocumentProcessor();
    }

    /**
     * Index a RAG source (bucket/folder/files).
     */
    async indexSource(
        config: RagSourceConfig,
        context: { tenant_id?: string; project_id?: string },
        onProgress?: (job: RagIndexJob) => void
    ): Promise<RagIndexJob> {
        return this.processor.processSource(config, context, onProgress);
    }

    /**
     * Search with metadata filters.
     */
    async search(query: string, options?: RagSearchOptions): Promise<any[]> {
        return searchRagDocuments(query, options);
    }
}

// Singleton instance
let _ragService: RagService | null = null;

export function getRagService(): RagService {
    if (!_ragService) {
        _ragService = new RagService();
    }
    return _ragService;
}

export function resetRagService(): void {
    _ragService = null;
}
