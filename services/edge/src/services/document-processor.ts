/**
 * Document Processor — Text extraction, chunking, and embedding for RAG.
 *
 * Pipeline:
 *   1. Extract text (OCR for images, direct for text-based docs)
 *   2. Chunk into segments (with overlap)
 *   3. Embed chunks (via Workers AI or Ollama)
 *   4. Store vectors (with metadata)
 *
 * Metadata filtering for multi-tenant isolation:
 *   - client_id: Extracted from file path (e.g., /clients/{id}/docs/* → {id})
 *   - tenant_id: From request context
 *   - project_id: From request context
 *   - source: Original file/bucket identifier
 *   - content_type: MIME type of source
 */

import { getOcrService, type OcrResult } from '../services/ocr/index.js';

// =============================================================================
// Types
// =============================================================================

export interface DocumentChunk {
    id: string;
    text: string;
    metadata: ChunkMetadata;
}

export interface ChunkMetadata {
    tenant_id?: string;
    project_id?: string;
    client_id?: string; // Extracted from file path for multi-tenant isolation
    source: string; // File path or URL
    content_type: string;
    chunk_index: number;
    total_chunks: number;
    created_at: string;
}

export interface EmbeddedChunk extends DocumentChunk {
    vector: number[];
}

export interface ProcessingResult {
    success: boolean;
    chunksEmbedded: number;
    vectorTableName: string;
    error?: string;
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CHUNK_SIZE = 1000; // characters
const DEFAULT_CHUNK_OVERLAP = 200; // characters
const DEFAULT_VECTOR_TABLE = 'rag_documents';

// =============================================================================
// Text Extraction
// =============================================================================

export class TextExtractor {
    private ocrService = getOcrService();

    /**
     * Extract text from a document buffer.
     * Detects content type and routes to appropriate extractor.
     */
    async extractText(buffer: Uint8Array, contentType: string, url?: string): Promise<string> {
        const type = contentType.toLowerCase();

        // Image types → OCR
        if (type.startsWith('image/')) {
            const result = await this.ocrService.extractText(buffer, url);
            if (result.error) {
                throw new Error(`OCR failed: ${result.error}`);
            }
            return result.text;
        }

        // PDF → OCR or text extraction
        if (type === 'application/pdf') {
            // For PDF, we'll use OCR as well (complex PDFs are often image-based)
            const result = await this.ocrService.extractText(buffer, url);
            if (result.error) {
                throw new Error(`PDF OCR failed: ${result.error}`);
            }
            return result.text;
        }

        // Text-based documents → direct decode
        if (type.includes('text') || type.includes('json') || type.includes('xml') || type.includes('html')) {
            return new TextDecoder().decode(buffer);
        }

        // Binary docs (docx, xlsx, etc.) — not supported in edge context
        throw new Error(`Unsupported content type: ${contentType}`);
    }
}

// =============================================================================
// Chunking
// =============================================================================

export class DocumentChunker {
    constructor(
        private chunkSize: number = DEFAULT_CHUNK_SIZE,
        private overlap: number = DEFAULT_CHUNK_OVERLAP
    ) {}

    /**
     * Split text into overlapping chunks.
     * Respects sentence boundaries when possible.
     */
    chunkText(text: string): string[] {
        if (text.length <= this.chunkSize) {
            return [text];
        }

        const chunks: string[] = [];
        let start = 0;

        while (start < text.length) {
            let end = start + this.chunkSize;

            // Try to break at sentence boundary
            if (end < text.length) {
                const lastPeriod = text.lastIndexOf('.', end);
                const lastNewline = text.lastIndexOf('\n', end);
                const breakPoint = Math.max(lastPeriod, lastNewline);

                if (breakPoint > start + this.chunkSize / 2) {
                    end = breakPoint + 1;
                }
            }

            chunks.push(text.slice(start, end).trim());
            start = end - this.overlap;

            // Avoid infinite loop on very short chunks
            if (start <= 0 && chunks.length > 1) break;
        }

        return chunks.filter(c => c.length > 0);
    }

    /**
     * Create chunk objects with metadata.
     */
    createChunks(
        text: string,
        metadata: Omit<ChunkMetadata, 'chunk_index' | 'total_chunks' | 'created_at'>
    ): DocumentChunk[] {
        const textChunks = this.chunkText(text);
        const now = new Date().toISOString();

        return textChunks.map((chunkText, index) => ({
            id: this.generateChunkId(metadata.source, index),
            text: chunkText,
            metadata: {
                ...metadata,
                chunk_index: index,
                total_chunks: textChunks.length,
                created_at: now,
            },
        }));
    }

    private generateChunkId(source: string, index: number): string {
        // Create a stable ID from source + index
        const normalized = source.replace(/[^a-zA-Z0-9]/g, '_');
        return `${normalized}_chunk_${index}`;
    }
}

// =============================================================================
// Metadata Extraction
// =============================================================================

/**
 * Extract client_id from file path for multi-tenant isolation.
 *
 * Patterns:
 *   /clients/{id}/docs/* → {id}
 *   /client-{id}/* → {id}
 *   /{tenant}/clients/{id}/* → {id}
 */
export function extractClientIdFromPath(path: string): string | undefined {
    const patterns = [
        /\/clients\/([a-zA-Z0-9_-]+)/i,
        /\/client-([a-zA-Z0-9_-]+)/i,
        /\/tenant\/[^/]+\/clients\/([a-zA-Z0-9_-]+)/i,
        /\/users\/([a-zA-Z0-9_-]+)/i,
        /\/user-([a-zA-Z0-9_-]+)/i,
    ];

    for (const pattern of patterns) {
        const match = path.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return undefined;
}

// =============================================================================
// Embedding Service (Placeholder)
// =============================================================================

export interface EmbeddingService {
    embed(text: string): Promise<number[]>;
}

/**
 * Workers AI embedding provider (Cloudflare).
 */
class WorkersAiEmbedding implements EmbeddingService {
    private accountId: string;
    private apiToken: string;

    constructor(accountId?: string, apiToken?: string) {
        this.accountId = accountId || (process.env.CLOUDFLARE_ACCOUNT_ID || '');
        this.apiToken = apiToken || (process.env.CLOUDFLARE_API_TOKEN || '');
    }

    async embed(text: string): Promise<number[]> {
        if (!this.accountId || !this.apiToken) {
            throw new Error('Cloudflare credentials not configured');
        }

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text }),
            }
        );

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.errors?.[0]?.message || 'Embedding failed');
        }

        return data.result?.data?.[0] || data.result || [];
    }
}

/**
 * Ollama embedding provider (Docker/local).
 */
class OllamaEmbedding implements EmbeddingService {
    private baseUrl: string;
    private model: string;

    constructor(baseUrl?: string, model?: string) {
        this.baseUrl = baseUrl || 'http://localhost:11434';
        this.model = model || 'nomic-embed-text';
    }

    async embed(text: string): Promise<number[]> {
        const response = await fetch(`${this.baseUrl}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                input: text,
            }),
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return data.embeddings?.[0] || [];
    }
}

/**
 * Get embedding service based on configuration.
 */
export function getEmbeddingService(): EmbeddingService {
    // Check for Workers AI credentials
    if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
        return new WorkersAiEmbedding();
    }

    // Check for Ollama
    if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_ENDPOINT) {
        return new OllamaEmbedding();
    }

    throw new Error('No embedding service configured. Set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN for Workers AI, or OLLAMA_BASE_URL for Ollama.');
}

// =============================================================================
// Document Processor
// =============================================================================

export class DocumentProcessor {
    private extractor: TextExtractor;
    private chunker: DocumentChunker;
    private embeddingService: EmbeddingService;

    constructor(
        embeddingService?: EmbeddingService,
        chunkSize?: number,
        overlap?: number
    ) {
        this.extractor = new TextExtractor();
        this.chunker = new DocumentChunker(chunkSize, overlap);
        this.embeddingService = embeddingService || getEmbeddingService();
    }

    /**
     * Process a document: extract → chunk → embed.
     */
    async processDocument(
        buffer: Uint8Array,
        source: string,
        contentType: string,
        context: {
            tenant_id?: string;
            project_id?: string;
        }
    ): Promise<EmbeddedChunk[]> {
        // Step 1: Extract text
        const text = await this.extractor.extractText(buffer, contentType, source);

        if (!text.trim()) {
            throw new Error('No text extracted from document');
        }

        // Step 2: Create chunks with metadata
        const clientId = extractClientIdFromPath(source);
        const chunks = this.chunker.createChunks(text, {
            tenant_id: context.tenant_id,
            project_id: context.project_id,
            client_id: clientId,
            source,
            content_type: contentType,
        });

        // Step 3: Embed each chunk
        const embedded: EmbeddedChunk[] = [];

        for (const chunk of chunks) {
            const vector = await this.embeddingService.embed(chunk.text);
            embedded.push({ ...chunk, vector });
        }

        return embedded;
    }

    /**
     * Process and store documents in vector database.
     */
    async processAndStore(
        documents: Array<{
            buffer: Uint8Array;
            source: string;
            contentType: string;
        }>,
        context: {
            tenant_id?: string;
            project_id?: string;
        },
        vectorTableName: string = DEFAULT_VECTOR_TABLE
    ): Promise<ProcessingResult> {
        try {
            // Uses the module-level upsertVectors() helper (defined below), which
            // posts to the vector route — routes/vector.js exports no such symbol.
            let totalEmbedded = 0;

            for (const doc of documents) {
                const embedded = await this.processDocument(
                    doc.buffer,
                    doc.source,
                    doc.contentType,
                    context
                );

                // Convert to vector store format
                const vectors = embedded.map(e => ({
                    id: e.id,
                    vector: e.vector,
                    ...e.metadata,
                }));

                // Store in vector database
                await upsertVectors(vectorTableName, vectors);
                totalEmbedded += embedded.length;
            }

            return {
                success: true,
                chunksEmbedded: totalEmbedded,
                vectorTableName,
            };
        } catch (err: any) {
            return {
                success: false,
                chunksEmbedded: 0,
                vectorTableName,
                error: err.message,
            };
        }
    }
}

// =============================================================================
// Vector Store Helper
// =============================================================================

/**
 * Upsert vectors (for use by document processor).
 * This is a re-export of the vector route's internal function.
 */
export async function upsertVectors(
    tableName: string,
    vectors: Array<{ id: string; vector: number[]; [key: string]: any }>
): Promise<void> {
    // This will call the vector route's upsert endpoint
    // For now, we'll implement a basic fetch-based call
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`;
    const url = `${baseUrl}/api/vector/upsert`;

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName, vectors }),
    });
}

/**
 * Search vectors with metadata filters.
 */
export async function searchVectors(
    tableName: string,
    queryText: string,
    context: {
        tenant_id?: string;
        project_id?: string;
        client_id?: string;
    },
    limit: number = 10
): Promise<Array<{ id: string; text: string; score: number; metadata: any }>> {
    // Get embedding for query
    const embeddingService = getEmbeddingService();
    const queryVector = await embeddingService.embed(queryText);

    // Search vector store
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`;
    const url = `${baseUrl}/api/vector/search`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName, queryVector, limit }),
    });

    const data = await response.json();

    if (!data.success) {
        throw new Error(data.message || 'Vector search failed');
    }

    // Filter results by metadata (client_id, tenant_id, project_id)
    let results = data.results || [];

    if (context.client_id) {
        results = results.filter((r: any) => r.client_id === context.client_id);
    }
    if (context.tenant_id) {
        results = results.filter((r: any) => r.tenant_id === context.tenant_id);
    }
    if (context.project_id) {
        results = results.filter((r: any) => r.project_id === context.project_id);
    }

    return results.map((r: any) => ({
        id: r.id,
        text: r.text || '',
        score: r._score || r.score || 0,
        metadata: { ...r, id: undefined, text: undefined, _score: undefined, score: undefined },
    }));
}
