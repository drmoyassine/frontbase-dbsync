/**
 * Adaptive OCR Service — Zero-footprint text extraction from images.
 *
 * Three-tier hierarchy (priority order):
 *   1. UI HTTP override — Custom endpoint configured via settings UI
 *   2. Docker local — OCR_ENGINE env var (tesseract | gnu_ocrad)
 *   3. Default — OCR.space API (zero footprint, universal)
 *
 * Platform constraints:
 *   - Docker edges: Can use local binaries (tesseract, gnu_ocrad)
 *   - Cloud edges: Must use HTTP APIs (OCR.space, Workers AI, custom)
 *   - Bundle size: No heavy JS libraries for cloud platforms
 *
 * Usage:
 *   const ocrService = new OcrService();
 *   const text = await ocrService.extractText(imageBuffer, imageUrl);
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Convert Uint8Array to base64 without memory issues on large buffers.
 * Uses chunked encoding to avoid spreading large arrays.
 */
function bufferToBase64(buffer: Uint8Array): string {
    const chunks: string[] = [];
    const chunkSize = 0x8000; // 32KB chunks

    for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.subarray(i, i + chunkSize);
        chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
    }

    return btoa(chunks.join(''));
}

export interface OcrResult {
    text: string;
    engine: string;
    confidence?: number;
    error?: string;
}

export interface OcrEngine {
    name: string;
    extractText(imageBuffer: Uint8Array, imageUrl?: string): Promise<OcrResult>;
}

// =============================================================================
// OCR.space Engine (Default, Universal)
// =============================================================================

class OcrSpaceEngine implements OcrEngine {
    name = 'ocrspace';
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey?: string, baseUrl?: string) {
        this.apiKey = apiKey || (process.env.OCRSPACE_API_KEY || '');
        this.baseUrl = baseUrl || 'https://api.ocr.space/parse/image';
    }

    async extractText(imageBuffer: Uint8Array, imageUrl?: string): Promise<OcrResult> {
        if (!this.apiKey) {
            return {
                text: '',
                engine: this.name,
                error: 'OCR.space API key not configured. Set OCRSPACE_API_KEY env var or FRONTBASE_OCR.apiKey.',
            };
        }

        try {
            const formData = new FormData();
            formData.append('apikey', this.apiKey);
            formData.append('OCREngine', '2'); // OCR Engine 2 (more accurate)

            if (imageUrl) {
                formData.append('url', imageUrl);
            } else {
                formData.append('file', new Blob([imageBuffer]), 'image.png');
            }

            formData.append('isTable', 'false');
            formData.append('scale', 'true');
            formData.append('OCREngine', '2');
            formData.append('language', 'eng');
            formData.append('detectOrientation', 'true');
            formData.append('isCreateSearchablePdf', 'false');
            formData.append('isSearchablePdfHideTextLayer', 'false');

            const response = await fetch(this.baseUrl, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!data.IsErroredOnProcessing) {
                const parsed = data.ParsedResults?.[0];
                return {
                    text: parsed?.Text || '',
                    engine: this.name,
                    confidence: parsed?.TextOverlay?.Lines?.[0]?.Words?.[0]?.Confidence,
                };
            } else {
                return {
                    text: '',
                    engine: this.name,
                    error: data.ErrorMessage?.[0] || 'OCR processing failed',
                };
            }
        } catch (err: any) {
            return {
                text: '',
                engine: this.name,
                error: err.message || 'OCR.space request failed',
            };
        }
    }
}

// =============================================================================
// Workers AI Vision Engine (Cloudflare)
// =============================================================================

class WorkersAiEngine implements OcrEngine {
    name = 'workers_ai';
    private accountId: string;
    private apiToken: string;

    constructor(accountId?: string, apiToken?: string) {
        this.accountId = accountId || (process.env.CLOUDFLARE_ACCOUNT_ID || '');
        this.apiToken = apiToken || (process.env.CLOUDFLARE_API_TOKEN || '');
    }

    async extractText(imageBuffer: Uint8Array, imageUrl?: string): Promise<OcrResult> {
        if (!this.accountId || !this.apiToken) {
            return {
                text: '',
                engine: this.name,
                error: 'Cloudflare credentials not configured. Set cfAccountId and cfApiToken in FRONTBASE_OCR.',
            };
        }

        try {
            // For Workers AI, we need to use the image URL or base64
            let imageInput: string;

            if (imageUrl) {
                imageInput = imageUrl;
            } else {
                // Convert buffer to base64 data URL (streaming-friendly approach)
                const base64 = bufferToBase64(imageBuffer);
                imageInput = `data:image/png;base64,${base64}`;
            }

            // Use Workers AI vision-capable model for OCR tasks
            // Note: As of 2024, Workers AI has limited OCR-specific models.
            // Using a vision-language model that can describe images.
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/unstruktur/salesforce-blip-image-captioning-base`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        image: imageInput,
                        prompt: 'Extract all visible text from this image. Return the text exactly as it appears.',
                        max_tokens: 1000,
                    }),
                }
            );

            const data = await response.json();

            if (data.success && data.result?.response) {
                return {
                    text: data.result.response,
                    engine: this.name,
                };
            } else {
                return {
                    text: '',
                    engine: this.name,
                    error: data.errors?.[0]?.message || 'Workers AI request failed',
                };
            }
        } catch (err: any) {
            return {
                text: '',
                engine: this.name,
                error: err.message || 'Workers AI request failed',
            };
        }
    }
}

// =============================================================================
// Custom HTTP Engine (UI Override)
// =============================================================================

class CustomHttpEngine implements OcrEngine {
    name = 'custom_http';
    private endpoint: string;
    private apiKey?: string;

    constructor(endpoint: string, apiKey?: string) {
        this.endpoint = endpoint;
        this.apiKey = apiKey;
    }

    async extractText(imageBuffer: Uint8Array, imageUrl?: string): Promise<OcrResult> {
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }

            // Send as base64 (use streaming-friendly conversion for large images)
            const base64 = bufferToBase64(imageBuffer);

            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    image: `data:image/png;base64,${base64}`,
                    url: imageUrl,
                }),
            });

            const data = await response.json();

            // Support multiple response formats
            const text = data.text || data.result || data.extractedText || data.output || '';

            if (!text) {
                return {
                    text: '',
                    engine: this.name,
                    error: data.error || data.message || 'No text returned from custom OCR endpoint',
                };
            }

            return {
                text: typeof text === 'string' ? text : JSON.stringify(text),
                engine: this.name,
            };
        } catch (err: any) {
            return {
                text: '',
                engine: this.name,
                error: err.message || 'Custom OCR endpoint request failed',
            };
        }
    }
}

// =============================================================================
// Tesseract Engine (Docker-only, native binary)
// =============================================================================

class TesseractEngine implements OcrEngine {
    name = 'tesseract';

    async extractText(imageBuffer: Uint8Array, imageUrl?: string): Promise<OcrResult> {
        try {
            // Dynamic import to avoid bundling into cloud builds
            const { exec } = await import('node:child_process');
            const { promisify } = await import('node:util');
            const { writeFile, unlink, mkdir } = await import('node:fs/promises');
            const { randomUUID } = await import('node:crypto');
            const { join } = await import('node:path');
            const tmpDir = '/tmp/ocr';

            const execAsync = promisify(exec);

            // Ensure temp directory exists
            await mkdir(tmpDir, { recursive: true });

            const filename = `${randomUUID()}.png`;
            const inputPath = join(tmpDir, filename);
            const outputPath = join(tmpDir, `${randomUUID()}`);

            // Write image to temp file
            await writeFile(inputPath, imageBuffer);

            try {
                // Run tesseract
                const { stdout } = await execAsync(`tesseract "${inputPath}" "${outputPath}" -l eng`);

                // Read output
                const { readFile } = await import('node:fs/promises');
                const text = await readFile(`${outputPath}.txt`, 'utf-8');

                return {
                    text: text.trim(),
                    engine: this.name,
                };
            } finally {
                // Cleanup
                try {
                    await unlink(inputPath);
                    await unlink(`${outputPath}.txt`);
                } catch {
                    // Ignore cleanup errors
                }
            }
        } catch (err: any) {
            return {
                text: '',
                engine: this.name,
                error: err.message || 'Tesseract OCR failed. Is tesseract installed and in PATH?',
            };
        }
    }
}

// =============================================================================
// GNU Ocrad Engine (Docker-only, native binary)
// =============================================================================

class GnuOcradEngine implements OcrEngine {
    name = 'gnu_ocrad';

    async extractText(imageBuffer: Uint8Array, imageUrl?: string): Promise<OcrResult> {
        try {
            // Dynamic import to avoid bundling into cloud builds
            const { exec } = await import('node:child_process');
            const { promisify } = await import('node:util');
            const { writeFile, unlink, mkdir } = await import('node:fs/promises');
            const { randomUUID } = await import('node:crypto');
            const { join } = await import('node:path');
            const tmpDir = '/tmp/ocr';

            const execAsync = promisify(exec);

            // Ensure temp directory exists
            await mkdir(tmpDir, { recursive: true });

            const filename = `${randomUUID()}.png`;
            const inputPath = join(tmpDir, filename);

            // Write image to temp file
            await writeFile(inputPath, imageBuffer);

            try {
                // Run ocrad (outputs to stdout by default with -o flag)
                const { stdout } = await execAsync(`ocrad -i "${inputPath}" -o -`);

                return {
                    text: stdout.trim(),
                    engine: this.name,
                };
            } finally {
                // Cleanup
                try {
                    await unlink(inputPath);
                } catch {
                    // Ignore cleanup errors
                }
            }
        } catch (err: any) {
            return {
                text: '',
                engine: this.name,
                error: err.message || 'GNU Ocrad failed. Is ocrad installed and in PATH?',
            };
        }
    }
}

// =============================================================================
// OCR Service Factory (Adaptive Selection)
// =============================================================================

export class OcrService {
    private engine: OcrEngine;

    constructor() {
        this.engine = this.createEngine();
    }

    private createEngine(): OcrEngine {
        const config = this.getConfig();

        // Priority 1: UI custom endpoint override
        if (config.endpoint) {
            return new CustomHttpEngine(config.endpoint, config.apiKey);
        }

        // Priority 2: Docker env var override OR JSON config engine
        if (config.engine === 'tesseract') {
            return new TesseractEngine();
        }
        if (config.engine === 'gnu_ocrad') {
            return new GnuOcradEngine();
        }

        // Priority 3: Workers AI
        if (config.engine === 'workers_ai') {
            return new WorkersAiEngine(config.cfAccountId, config.cfApiToken);
        }

        // Priority 4: Default to OCR.space
        if (config.engine === 'ocrspace' || !config.engine) {
            return new OcrSpaceEngine(config.apiKey, config.ocrspaceBaseUrl);
        }

        // Fallback: Unknown engine, default to OCR.space
        console.warn(`[OCR] Unknown engine '${config.engine}', defaulting to OCR.space`);
        return new OcrSpaceEngine(config.apiKey);
    }

    private getConfig() {
        try {
            const { getOcrConfig } = require('../../config/env.js');
            return getOcrConfig();
        } catch {
            // Fallback if env module not available
            return { engine: 'ocrspace' };
        }
    }

    async extractText(imageBuffer: Uint8Array, imageUrl?: string): Promise<OcrResult> {
        const result = await this.engine.extractText(imageBuffer, imageUrl);

        if (result.error) {
            console.error(`[OCR] Extraction failed: ${result.error}`);
        } else {
            console.log(`[OCR] Extracted ${result.text.length} chars using ${result.engine}`);
        }

        return result;
    }

    /** Get the active engine name (for debugging/monitoring) */
    getEngineName(): string {
        return this.engine.name;
    }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _ocrService: OcrService | null = null;

export function getOcrService(): OcrService {
    if (!_ocrService) {
        _ocrService = new OcrService();
    }
    return _ocrService;
}

export function resetOcrService(): void {
    _ocrService = null;
}
