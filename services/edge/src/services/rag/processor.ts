/**
 * Storage-Aware Document Processor — Index files from buckets/folders.
 *
 * Pipeline:
 *   1. List files from storage (bucket/folder scope) via direct adapter
 *   2. Filter by patterns and MIME types
 *   3. Download and extract text (OCR for images)
 *   4. Extract metadata from file paths
 *   5. Chunk and embed
 *   6. Store with metadata filters
 *
 * Edge self-sufficiency: Uses storage adapters directly (Supabase, R2, etc.)
 * with credentials from FRONTBASE_STORAGE env var (set at deploy time).
 * No backend API calls — maintains edge independence.
 */

import {
    RagSourceConfig,
    RagIndexJob,
    extractMetadataFromPath,
    type RagConfigStore,
} from './config.js';
import { getOcrService } from '../ocr/index.js';
import { getEmbeddingService } from '../document-processor.js';
import { getStorageAdapter, type StorageAdapter } from './storage-adapter.js';
import { getVectorAdapter, validateBucketName, validateFilePath } from './vector-adapter.js';

// =============================================================================
// Types
// =============================================================================

export interface StorageFile {
    name: string;
    id: string;
    path: string; // Full path within bucket
    bucket: string;
    size: number;
    mimetype?: string;
    updated_at?: string;
}

export interface IndexedChunk {
    id: string;
    text: string;
    vector: number[];
    metadata: {
        source_config_id: string;
        bucket: string;
        path: string;
        tenant_id?: string;
        project_id?: string;
        client_id?: string;
        content_type: string;
        chunk_index: number;
        total_chunks: number;
        created_at: string;
        [key: string]: any;
    };
}

export interface ProcessorOptions {
    chunkSize?: number;
    chunkOverlap?: number;
    onProgress?: (job: RagIndexJob) => void;
}

// =============================================================================
// Storage File Fetcher
// =============================================================================

/**
 * Fetch files using direct storage adapter (Supabase, R2, etc.).
 * Maintains edge self-sufficiency — no backend API calls.
 */
export class StorageFileFetcher {
    private adapter: StorageAdapter;

    constructor(adapter?: StorageAdapter) {
        this.adapter = adapter || getStorageAdapter();
    }

    /**
     * List files from a storage bucket/folder.
     */
    async listFiles(
        bucket: string,
        folderPath?: string,
        patterns?: { include?: string[]; exclude?: string[] }
    ): Promise<StorageFile[]> {
        // Security validation
        validateBucketName(bucket);
        if (folderPath) {
            validateFilePath(folderPath);
        }

        const files = await this.adapter.listFiles(bucket, folderPath);

        // Apply include patterns
        let filtered = files;
        if (patterns?.include && patterns.include.length > 0) {
            filtered = filtered.filter((f) =>
                patterns.include!.some((pattern) => this.matchesPattern(f.path, pattern))
            );
        }

        // Apply exclude patterns
        if (patterns?.exclude && patterns.exclude.length > 0) {
            filtered = filtered.filter(
                (f) => !patterns.exclude!.some((pattern) => this.matchesPattern(f.path, pattern))
            );
        }

        return filtered;
    }

    /**
     * Download a file's content.
     */
    async downloadFile(
        bucket: string,
        path: string
    ): Promise<{ buffer: Uint8Array; contentType: string }> {
        return this.adapter.downloadFile(bucket, path);
    }

    /**
     * Simple glob pattern matching.
     */
    private matchesPattern(filePath: string, pattern: string): boolean {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(filePath);
    }
}

// =============================================================================
// Document Processor
// =============================================================================

export class RagDocumentProcessor {
    private fetcher: StorageFileFetcher;
    private ocrService = getOcrService();
    private embeddingService = getEmbeddingService();
    private options: ProcessorOptions;

    constructor(adapter?: StorageAdapter, options?: ProcessorOptions) {
        this.fetcher = new StorageFileFetcher(adapter);
        this.options = {
            chunkSize: options?.chunkSize || 1000,
            chunkOverlap: options?.chunkOverlap || 200,
            onProgress: options?.onProgress,
        };
    }

    /**
     * Process a RAG source config: list → filter → extract → chunk → embed → store.
     */
    async processSource(
        config: RagSourceConfig,
        context: {
            tenant_id?: string;
            project_id?: string;
        },
        vectorTableName: string = 'rag_documents'
    ): Promise<RagIndexJob> {
        const job: RagIndexJob = {
            id: this.generateJobId(),
            source_config_id: config.id,
            status: 'running',
            files_processed: 0,
            chunks_indexed: 0,
            started_at: new Date().toISOString(),
        };

        this.options.onProgress?.(job);

        try {
            let files: StorageFile[] = [];

            // List files based on source type
            if (config.type === 'files' && config.file_paths) {
                // For explicit file list, we need to get file metadata
                // This would require backend support, skipping for now
                files = [];
            } else {
                files = await this.fetcher.listFiles(
                    config.bucket_name!,
                    config.folder_path,
                    {
                        include: config.include_patterns,
                        exclude: config.exclude_patterns,
                    }
                );
            }

            // Filter by MIME types
            if (config.mime_types && config.mime_types.length > 0) {
                files = files.filter((f) =>
                    config.mime_types!.some((type) => this.matchesMimeType(f.mimetype, type))
                );
            }

            const allChunks: IndexedChunk[] = [];

            // Process each file
            for (const file of files) {
                try {
                    const chunks = await this.processFile(file, config, context);
                    allChunks.push(...chunks);
                    job.files_processed++;
                } catch (err: any) {
                    console.error(`[RAG] Failed to process ${file.path}:`, err.message);
                    // Continue with other files
                }

                // Report progress periodically
                if (job.files_processed % 10 === 0) {
                    this.options.onProgress?.(job);
                }
            }

            // Store all chunks in vector database
            if (allChunks.length > 0) {
                await this.storeChunks(vectorTableName, allChunks);
                job.chunks_indexed = allChunks.length;
            }

            job.status = 'completed';
            job.completed_at = new Date().toISOString();
        } catch (err: any) {
            job.status = 'failed';
            job.error = err.message;
            job.completed_at = new Date().toISOString();
        }

        this.options.onProgress?.(job);
        return job;
    }

    /**
     * Process a single file.
     */
    private async processFile(
        file: StorageFile,
        config: RagSourceConfig,
        context: { tenant_id?: string; project_id?: string }
    ): Promise<IndexedChunk[]> {
        // Download file
        const { buffer, contentType } = await this.fetcher.downloadFile(
            file.bucket,
            file.path
        );

        // Extract text (OCR for images)
        const ocrResult = await this.ocrService.extractText(buffer, `${file.bucket}/${file.path}`);

        if (ocrResult.error) {
            throw new Error(`OCR failed: ${ocrResult.error}`);
        }

        const text = ocrResult.text;
        if (!text.trim()) {
            return [];
        }

        // Extract metadata from path
        const extractedMetadata = extractMetadataFromPath(
            file.path,
            config.metadata_mappings
        );

        // Chunk text
        const chunks = this.chunkText(text);
        const now = new Date().toISOString();

        return chunks.map((chunkText, index) => {
            const chunkId = this.generateChunkId(file.path, index);
            const metadata = {
                source_config_id: config.id,
                bucket: file.bucket,
                path: file.path,
                tenant_id: context.tenant_id,
                project_id: context.project_id,
                client_id: extractedMetadata.client_id,
                content_type: contentType,
                chunk_index: index,
                total_chunks: chunks.length,
                created_at: now,
                ...extractedMetadata,
            };

            // Remove client_id from metadata (we already set it)
            delete (metadata as any).client_id;

            return {
                id: chunkId,
                text: chunkText,
                vector: [], // Will be embedded below
                metadata,
            };
        });
    }

    /**
     * Chunk text with overlap.
     */
    private chunkText(text: string): string[] {
        const chunkSize = this.options.chunkSize || 1000;
        const overlap = this.options.chunkOverlap || 200;

        if (text.length <= chunkSize) {
            return [text];
        }

        const chunks: string[] = [];
        let start = 0;

        while (start < text.length) {
            let end = start + chunkSize;

            // Try to break at sentence boundary
            if (end < text.length) {
                const lastPeriod = text.lastIndexOf('.', end);
                const lastNewline = text.lastIndexOf('\n', end);
                const breakPoint = Math.max(lastPeriod, lastNewline);

                if (breakPoint > start + chunkSize / 2) {
                    end = breakPoint + 1;
                }
            }

            chunks.push(text.slice(start, end).trim());
            start = end - overlap;

            if (start <= 0 && chunks.length > 1) break;
        }

        return chunks.filter((c) => c.length > 0);
    }

    /**
     * Embed and store chunks using vector adapter (edge self-sufficiency).
     */
    private async storeChunks(
        tableName: string,
        chunks: IndexedChunk[]
    ): Promise<void> {
        // Ensure table exists
        const vectorAdapter = getVectorAdapter();
        await vectorAdapter.ensureTable(tableName);

        // Embed each chunk
        for (const chunk of chunks) {
            chunk.vector = await this.embeddingService.embed(chunk.text);
        }

        // Store in vector database directly (no backend API call)
        const vectors = chunks.map((c) => ({
            id: c.id,
            vector: c.vector,
            text: c.text,
            metadata: c.metadata,
        }));

        await vectorAdapter.upsert(tableName, vectors);
    }

    /**
     * Check if a MIME type matches a pattern (e.g., "image/*" matches "image/png").
     */
    private matchesMimeType(mimeType: string | undefined, pattern: string): boolean {
        if (!mimeType) return false;

        const normalizedPattern = pattern.toLowerCase();
        const normalizedType = mimeType.toLowerCase();

        if (normalizedPattern === '*') return true;
        if (normalizedPattern.endsWith('/*')) {
            const prefix = normalizedPattern.slice(0, -2);
            return normalizedType.startsWith(prefix);
        }

        return normalizedType === normalizedPattern;
    }

    private generateJobId(): string {
        return `job_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }

    private generateChunkId(path: string, index: number): string {
        const normalized = path.replace(/[^a-zA-Z0-9]/g, '_');
        return `${normalized}_chunk_${index}`;
    }
}

// =============================================================================
// RAG Search with Metadata Filters
// =============================================================================

export interface RagSearchOptions {
    tenant_id?: string;
    project_id?: string;
    filters?: {
        client_id?: string;
        source_config_id?: string;
        bucket?: string;
        custom?: Record<string, string>;
    };
    limit?: number;
}

/**
 * Search RAG documents with metadata filters using vector adapter (edge self-sufficiency).
 */
export async function searchRagDocuments(
    query: string,
    options: RagSearchOptions = {}
): Promise<any[]> {
    // Get embedding for query
    const embeddingService = getEmbeddingService();
    const queryVector = await embeddingService.embed(query);

    const tableName = process.env.RAG_VECTOR_TABLE || 'rag_documents';
    const limit = options.limit || 10;

    // Build metadata filters for vector search
    const vectorFilters: Record<string, any> = {};
    if (options.tenant_id) {
        vectorFilters.tenant_id = options.tenant_id;
    }
    if (options.project_id) {
        vectorFilters.project_id = options.project_id;
    }
    if (options.filters?.client_id) {
        vectorFilters.client_id = options.filters.client_id;
    }
    if (options.filters?.source_config_id) {
        vectorFilters.source_config_id = options.filters.source_config_id;
    }
    if (options.filters?.bucket) {
        vectorFilters.bucket = options.filters.bucket;
    }

    // Apply custom filters
    if (options.filters?.custom) {
        Object.assign(vectorFilters, options.filters.custom);
    }

    // Search vector database directly using adapter (no backend API call)
    const vectorAdapter = getVectorAdapter();
    let results = await vectorAdapter.search(tableName, queryVector, limit * 2, vectorFilters);

    // Return formatted results
    return results.slice(0, limit).map((r: any) => ({
        chunk_id: r.id,
        text: r.text || '',
        score: r.score || 0,
        source: {
            bucket: r.metadata?.bucket,
            path: r.metadata?.path,
        },
        metadata: {
            tenant_id: r.metadata?.tenant_id,
            project_id: r.metadata?.project_id,
            client_id: r.metadata?.client_id,
            content_type: r.metadata?.content_type,
            source_config_id: r.metadata?.source_config_id,
        },
    }));
}
