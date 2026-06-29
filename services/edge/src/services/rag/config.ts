/**
 * RAG Configuration — Bucket and folder-level indexing for retrieval.
 *
 * Allows configuration at three levels:
 *   1. Bucket-level: Index all files in a bucket (with optional filters)
 *   2. Folder-level: Index specific folders within a bucket
 *   3. File-level: Index specific files (manual selection)
 *
 * Metadata filters enable multi-tenant document isolation:
 *   - client_id: Extracted from path patterns (/clients/{id}/*)
 *   - tenant_id: Inherited from request context
 *   - project_id: Inherited from request context
 *   - Custom tags: User-defined metadata key-value pairs
 */

// =============================================================================
// Types
// =============================================================================

export interface RagSourceConfig {
    id: string;
    name: string;
    type: 'bucket' | 'folder' | 'files';
    enabled: boolean;

    // Multi-tenant isolation
    tenant_id?: string; // Owner tenant for this config (enforced isolation)
    project_id?: string; // Optional project scope

    // Bucket config
    bucket_name?: string;

    // Folder config (when type='folder')
    folder_path?: string;

    // File config (when type='files')
    file_paths?: string[];

    // Filters (what to include/exclude)
    include_patterns?: string[]; // glob patterns: *.pdf, *.png
    exclude_patterns?: string[]; // glob patterns: *.tmp, temp/*
    mime_types?: string[]; // e.g., ['application/pdf', 'image/*']

    // Metadata extraction
    metadata_mappings?: Record<string, string>; // "client_id" -> "path:/clients/{id}/*"

    // Vector store config
    vector_table?: string; // Default: 'rag_documents'

    // OCR config override (optional)
    ocr_engine?: string; // Override default OCR engine for this source

    // Timestamps
    created_at: string;
    updated_at: string;
}

export interface RagIndexJob {
    id: string;
    source_config_id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    files_processed: number;
    chunks_indexed: number;
    error?: string;
    started_at?: string;
    completed_at?: string;
}

export interface RagSearchRequest {
    query: string;
    source_config_id?: string; // Optional: search specific source only
    filters?: RagMetadataFilter;
    limit?: number;
}

export interface RagMetadataFilter {
    tenant_id?: string;
    project_id?: string;
    client_id?: string;
    custom?: Record<string, string | string[]>;
}

export interface RagSearchResult {
    chunk_id: string;
    text: string;
    score: number;
    source: {
        bucket: string;
        path: string;
    };
    metadata: {
        tenant_id?: string;
        project_id?: string;
        client_id?: string;
        content_type: string;
        source_config_id?: string;
        [key: string]: any;
    };
}

// =============================================================================
// Default Patterns for Metadata Extraction
// =============================================================================

/**
 * Default metadata extraction patterns.
 * Maps metadata keys to path regex patterns.
 */
export const DEFAULT_METADATA_PATTERNS: Record<string, RegExp> = {
    // Client isolation: /clients/{id}/docs/*, /client-{id}/*
    client_id: /\/(?:clients|client-|users?|user-)([a-zA-Z0-9_-]+)\//i,

    // Document type: /invoices/*, /contracts/*
    doc_type: /\/(invoices?|contracts?|proposals|receipts|statements)\//i,

    // Year/month for time-based filtering: /2024/06/, /2024-june/
    year: /\/(\d{4})\//,
    month: /\/(\d{2})\//i,

    // Department: /hr/*, /finance/*, /legal/*
    department: /\/(hr|finance|legal|engineering|sales|marketing|support)\//i,
};

/**
 * Extract metadata from a file path using configured patterns.
 */
export function extractMetadataFromPath(
    path: string,
    mappings?: Record<string, string>
): Record<string, string> {
    const metadata: Record<string, string> = {};

    // Use custom mappings if provided, otherwise use defaults
    const patterns = mappings
        ? Object.fromEntries(
              Object.entries(mappings).map(([key, pattern]) => {
                  // Convert "path:/clients/{id}/*" to regex
                  const regexPattern = pattern
                      .replace(/^path:/i, '')
                      .replace(/\{[^}]+\}/g, '([a-zA-Z0-9_-]+)')
                      .replace(/\*/g, '.*');
                  return [key, new RegExp(regexPattern, 'i')];
              })
          )
        : DEFAULT_METADATA_PATTERNS;

    // Extract values using patterns
    for (const [key, pattern] of Object.entries(patterns)) {
        const match = path.match(pattern);
        if (match && match[1]) {
            metadata[key] = match[1];
        }
    }

    return metadata;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a RAG source configuration.
 */
export function validateRagConfig(config: RagSourceConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.name || config.name.trim().length === 0) {
        errors.push('name is required');
    }

    if (config.type === 'bucket') {
        if (!config.bucket_name) {
            errors.push('bucket_name is required for bucket type');
        }
    } else if (config.type === 'folder') {
        if (!config.bucket_name) {
            errors.push('bucket_name is required for folder type');
        }
        if (!config.folder_path) {
            errors.push('folder_path is required for folder type');
        }
    } else if (config.type === 'files') {
        if (!config.file_paths || config.file_paths.length === 0) {
            errors.push('file_paths is required for files type');
        }
    } else {
        errors.push(`Invalid type: ${config.type}`);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// =============================================================================
// Config Store Interface (for implementation)
// =============================================================================

/**
 * Interface for storing/retrieving RAG configurations.
 * Implementations can use state DB, external config, or vault.
 */
export interface RagConfigStore {
    listConfigs(): Promise<RagSourceConfig[]>;
    getConfig(id: string): Promise<RagSourceConfig | null>;
    createConfig(config: Omit<RagSourceConfig, 'id' | 'created_at' | 'updated_at'>): Promise<RagSourceConfig>;
    updateConfig(id: string, updates: Partial<RagSourceConfig>): Promise<RagSourceConfig>;
    deleteConfig(id: string): Promise<void>;

    // Index jobs
    createIndexJob(job: Omit<RagIndexJob, 'id' | 'started_at'>): Promise<RagIndexJob>;
    updateIndexJob(id: string, updates: Partial<RagIndexJob>): Promise<RagIndexJob>;
    getIndexJob(id: string): Promise<RagIndexJob | null>;
    listPendingJobs(): Promise<RagIndexJob[]>;
}
