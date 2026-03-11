/**
 * Edge Constants — Shared provider registry.
 *
 * Single source of truth for provider metadata consumed by:
 * - ConnectProviderDialog (form configs)
 * - DeployEngineWizard (labels, suffixes, provider set)
 * - EdgeProvidersSection (icons)
 * - EdgeDatabasesForm / EdgeCachesForm / EdgeQueuesForm (provider icons)
 *
 * To add a new provider: add entries to PROVIDER_ICONS, PROVIDER_CONFIGS,
 * and (if deployable) KNOWN_EDGE_PROVIDERS + PROVIDER_RESOURCE_LABELS.
 */

import React from 'react';
import { Cloud, Server, Globe, Rocket, Database, Workflow, Triangle, Hexagon, Zap, HardDrive } from 'lucide-react';

// ============================================================================
// API Base
// ============================================================================

export const API_BASE = '';

// ============================================================================
// Provider Icons — used everywhere for provider badge/icon display
// ============================================================================

export const PROVIDER_ICONS: Record<string, React.FC<any>> = {
    cloudflare: Cloud,
    docker: Server,
    flyio: Rocket,
    supabase: Database,
    upstash: Workflow,
    vercel: Triangle,
    netlify: Hexagon,
    deno: Zap,
    wordpress: Globe,
    wordpress_rest: Globe,
    wordpress_graphql: Globe,
    postgres: Database,
    mysql: HardDrive,
    neon: Database,
    turso: Cloud,
};

// ============================================================================
// Deployable Edge Providers — providers that can host an Edge Engine
// ============================================================================

export const KNOWN_EDGE_PROVIDERS = new Set([
    'cloudflare', 'supabase', 'upstash', 'vercel', 'netlify', 'deno',
]);


// ============================================================================
// Provider Resource Labels — used by DeployEngineWizard for input labels
// ============================================================================

export const PROVIDER_RESOURCE_LABELS: Record<string, { inputLabel: string; urlSuffix: string }> = {
    cloudflare: { inputLabel: 'Worker Name', urlSuffix: '.workers.dev' },
    supabase: { inputLabel: 'Function Name', urlSuffix: '' },
    vercel: { inputLabel: 'Project Name', urlSuffix: '.vercel.app' },
    netlify: { inputLabel: 'Site Name', urlSuffix: '.netlify.app' },
    deno: { inputLabel: 'Project Name', urlSuffix: '.deno.dev' },
    upstash: { inputLabel: 'Resource Name', urlSuffix: '.upstash.app' },
};

// ============================================================================
// GPU Model Type Colors & Labels — used by DeployEngineWizard catalog
// ============================================================================

export const GPU_TYPE_COLORS: Record<string, string> = {
    llm: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
    embedder: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    stt: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    tts: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
    image_gen: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    classifier: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    vision: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300',
};

export const GPU_TYPE_LABELS: Record<string, string> = {
    llm: '🔤 Text Generation',
    embedder: '📊 Embeddings',
    stt: '🎤 Speech-to-Text',
    tts: '🔊 Text-to-Speech',
    image_gen: '🖼️ Image Gen',
    classifier: '🏷️ Classifier',
    vision: '👁️ Vision',
    translator: '🌐 Translator',
    summarizer: '📝 Summarizer',
};

// ============================================================================
// GPU Catalog Types & API Helpers
// ============================================================================

export interface CatalogModel {
    name: string;
    model_id: string;
    task_type: string;
    model_type: string;
    description: string;
    properties: string[];
    schema: any;
}

export async function fetchGPUCatalog(
    providerId: string,
): Promise<{ models_by_type: Record<string, CatalogModel[]>; total: number }> {
    const res = await fetch(`${API_BASE}/api/edge-gpu/catalog?provider_id=${providerId}&provider=workers_ai`);
    if (!res.ok) throw new Error('Failed to fetch model catalog');
    return res.json();
}

export async function deployGPUModel(data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/api/edge-gpu/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to deploy model');
    }
    return res.json();
}

// ============================================================================
// Provider Credential Form Configs — used by ConnectProviderDialog
// ============================================================================

export interface ProviderFieldConfig {
    key: string;
    label: string;
    placeholder: string;
    type?: string;
    required?: boolean;
}

export type ProviderCapability = 'cpu' | 'gpu' | 'database' | 'auth' | 'storage' | 'cache' | 'queue' | 'vector_db' | 'search' | 'cms' | 'email';

/** Human-readable short labels for provider capabilities */
export const CAPABILITY_LABELS: Record<ProviderCapability, string> = {
    cpu: 'CPU',
    gpu: 'GPU',
    database: 'Database',
    auth: 'Auth',
    storage: 'Storage',
    cache: 'Cache',
    queue: 'Queue',
    vector_db: 'Vector DB',
    search: 'Search',
    cms: 'CMS',
    email: 'Email',
};

export interface ProviderConfig {
    label: string;
    defaultName: string;
    fields: ProviderFieldConfig[];
    helpText?: React.ReactNode;
    /** What this provider can do — used for filtering (e.g. deploy wizard GPU vs CPU) */
    capabilities?: ProviderCapability[];
}

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
    cloudflare: {
        label: 'Cloudflare',
        defaultName: 'Cloudflare Account',
        capabilities: ['cpu', 'gpu', 'database', 'storage', 'cache', 'queue', 'vector_db'],
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'Cloudflare API Token', type: 'password', required: true },
        ],
        helpText: <>Requires "Workers Scripts: Edit" and "Account Settings: Read". <a href="https://dash.cloudflare.com/profile/api-tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Create token →</a></>,
    },
    supabase: {
        label: 'Supabase',
        defaultName: 'Supabase Account',
        capabilities: ['cpu', 'database', 'auth', 'storage', 'vector_db'],
        fields: [
            { key: 'access_token', label: 'Access Token', placeholder: 'sbp_...', type: 'password', required: true },
        ],
        helpText: <><a href="https://supabase.com/dashboard/account/tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Generate access token →</a> One token discovers all your projects.</>,
    },
    upstash: {
        label: 'Upstash',
        defaultName: 'Upstash Account',
        capabilities: ['cpu', 'cache', 'queue', 'vector_db', 'search'],
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'Upstash API Token', type: 'password', required: true },
            { key: 'email', label: 'Email', placeholder: 'you@example.com', required: true },
        ],
        helpText: <><a href="https://console.upstash.com/account/api?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Get API key →</a> Found in Console → Account → Management API.</>,
    },
    vercel: {
        label: 'Vercel',
        defaultName: 'Vercel Account',
        capabilities: ['cpu', 'cache', 'storage', 'database'],
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'Vercel API Token', type: 'password', required: true },
        ],
        helpText: <><a href="https://vercel.com/account/tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Create token →</a> One token for all your projects.</>,
    },
    netlify: {
        label: 'Netlify',
        defaultName: 'Netlify Account',
        capabilities: ['cpu', 'storage'],
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'nfp_...', type: 'password', required: true },
        ],
        helpText: <><a href="https://app.netlify.com/user/applications#personal-access-tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Create token →</a> A site will be created automatically on first deploy.</>,
    },
    deno: {
        label: 'Deno',
        defaultName: 'Deno Deploy Account',
        capabilities: ['cpu', 'cache', 'queue'],
        fields: [
            { key: 'access_token', label: 'Organization Token', placeholder: 'ddo_...', type: 'password', required: true },
        ],
        helpText: <>Create an org token at your <a href="https://dash.deno.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Deno Deploy dashboard</a> → Organization Settings.</>,
    },
    neon: {
        label: 'Neon',
        defaultName: 'Neon Account',
        capabilities: ['database', 'auth'],
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'neon_api_...', type: 'password', required: true },
        ],
        helpText: <>Found in <a href="https://console.neon.tech/app/settings/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Neon console</a> → Account Settings → API Keys.</>,
    },
    postgres: {
        label: 'PostgreSQL',
        defaultName: 'PostgreSQL Server',
        capabilities: ['database'],
        fields: [
            { key: 'host', label: 'Host', placeholder: 'db.example.com', required: true },
            { key: 'port', label: 'Port', placeholder: '5432' },
            { key: 'database', label: 'Database', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', placeholder: 'postgres', required: true },
            { key: 'password', label: 'Password', placeholder: 'Password', type: 'password', required: true },
        ],
    },
    mysql: {
        label: 'MySQL',
        defaultName: 'MySQL Server',
        capabilities: ['database'],
        fields: [
            { key: 'host', label: 'Host', placeholder: 'db.example.com', required: true },
            { key: 'port', label: 'Port', placeholder: '3306' },
            { key: 'database', label: 'Database', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', placeholder: 'root', required: true },
            { key: 'password', label: 'Password', placeholder: 'Password', type: 'password', required: true },
        ],
    },
    wordpress: {
        label: 'WordPress',
        defaultName: 'WordPress Site',
        capabilities: ['cms'],
        fields: [
            { key: 'base_url', label: 'Site URL', placeholder: 'https://mysite.com', required: true },
            { key: 'username', label: 'Username', placeholder: 'admin', required: true },
            { key: 'app_password', label: 'Application Password', placeholder: 'xxxx xxxx xxxx xxxx', type: 'password', required: true },
        ],
        helpText: <>Generate an Application Password in WordPress → Users → Profile → Application Passwords.</>,
    },
    wordpress_rest: {
        label: 'WordPress',
        defaultName: 'WordPress Site',
        capabilities: ['cms'],
        fields: [
            { key: 'base_url', label: 'Site URL', placeholder: 'https://mysite.com', required: true },
            { key: 'username', label: 'Username', placeholder: 'admin', required: true },
            { key: 'app_password', label: 'Application Password', placeholder: 'xxxx xxxx xxxx xxxx', type: 'password', required: true },
        ],
        helpText: <>Generate an Application Password in WordPress → Users → Profile → Application Passwords.</>,
    },
    wordpress_graphql: {
        label: 'WordPress',
        defaultName: 'WordPress Site',
        capabilities: ['cms'],
        fields: [
            { key: 'base_url', label: 'Site URL', placeholder: 'https://mysite.com', required: true },
            { key: 'username', label: 'Username', placeholder: 'admin', required: true },
            { key: 'app_password', label: 'Application Password', placeholder: 'xxxx xxxx xxxx xxxx', type: 'password', required: true },
        ],
        helpText: <>Generate an Application Password in WordPress → Users → Profile → Application Passwords.</>,
    },
    turso: {
        label: 'Turso',
        defaultName: 'Turso Databases',
        capabilities: ['database'],
        fields: [
            { key: 'db_url', label: 'Database URL', placeholder: 'libsql://your-db.turso.io', required: true },
            { key: 'db_token', label: 'Auth Token', placeholder: 'Database auth token', type: 'password', required: true },
        ],
        helpText: <>Get your URL and token from the Turso dashboard or CLI.</>,
    },
};

// Derived: providers that support GPU inference (used to filter deploy wizard)
export const GPU_CAPABLE_PROVIDERS = new Set(
    Object.entries(PROVIDER_CONFIGS).filter(([, c]) => c.capabilities?.includes('gpu')).map(([k]) => k)
);
