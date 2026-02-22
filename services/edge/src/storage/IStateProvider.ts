/**
 * IStateProvider - Storage adapter interface for the Edge Engine
 * 
 * This defines the contract for how the Edge Engine reads/writes
 * published pages and project settings. Implementations:
 * - LocalSqliteProvider: local SQLite file (self-hosted)
 * - TursoHttpProvider: remote Turso DB over HTTP (cloud/BYOE)
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — providers read from their own
 * state DB only, never call FastAPI at runtime.
 */

import type { PublishPage, DatasourceConfig } from '../schemas/publish';

// =============================================================================
// Published Page Types (provider-agnostic)
// =============================================================================

export interface PublishedPageSummary {
    slug: string;
    name: string;
    version: number;
}

// =============================================================================
// Project Settings Types
// =============================================================================

export interface ProjectSettingsData {
    id: string;
    faviconUrl: string | null;
    logoUrl: string | null;
    siteName: string | null;
    siteDescription: string | null;
    appUrl: string | null;
    updatedAt: string;
}

// =============================================================================
// State Provider Interface
// =============================================================================

export interface IStateProvider {
    // --- Lifecycle ---
    /** Initialize storage (create tables, run migrations, etc.) */
    init(): Promise<void>;

    // --- Pages ---
    /** Upsert a published page (insert or update) */
    upsertPage(page: PublishPage): Promise<{ success: boolean; version: number }>;

    /** Get a published page by slug */
    getPageBySlug(slug: string): Promise<PublishPage | null>;

    /** Get the homepage */
    getHomepage(): Promise<PublishPage | null>;

    /** Delete a published page by slug */
    deletePage(slug: string): Promise<boolean>;

    /** List all published pages (summary only) */
    listPages(): Promise<PublishedPageSummary[]>;

    // --- Project Settings ---
    /** Initialize settings storage */
    initSettings(): Promise<void>;

    /** Get project settings (returns defaults if not set) */
    getProjectSettings(): Promise<ProjectSettingsData>;

    /** Get favicon URL (with fallback to default) */
    getFaviconUrl(): Promise<string>;

    /** Update project settings */
    updateProjectSettings(
        updates: Partial<Omit<ProjectSettingsData, 'id' | 'updatedAt'>>
    ): Promise<ProjectSettingsData>;
}
