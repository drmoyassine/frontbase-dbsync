/**
 * EdgeInspectorDialog — Mission Control Style
 *
 * Provider-agnostic inspector for deployed Edge Engines.
 * Split-pane layout: left panel (file tree + secrets + settings), right panel (Monaco editor / detail view).
 *
 * Currently supports Cloudflare Workers. Extensible to Vercel, Netlify, etc.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import {
    Search, FileCode, Lock, Settings2, ChevronDown, ChevronRight,
    File, Shield, Globe, Clock, Cpu, Loader2, AlertTriangle, ExternalLink, Zap,
} from 'lucide-react';
import type { EdgeEngine } from '@/hooks/useEdgeInfrastructure';

const API_BASE = '';

// ─── Types ──────────────────────────────────────────────────────────────────

interface InspectContentResponse {
    success: boolean;
    content: string;
    filename: string;
    size_bytes: number;
}

interface InspectSettingsResponse {
    success: boolean;
    settings: {
        compatibility_date: string;
        compatibility_flags: string[];
        usage_model: string;
        bindings: Array<{ type: string; name: string;[key: string]: any }>;
        routes: Array<{ type: string; pattern: string }>;
        cron_triggers: Array<{ cron: string; created_on?: string }>;
        placement: Record<string, any>;
        tail_consumers: any[];
    };
}

interface InspectSecretsResponse {
    success: boolean;
    secrets: string[];
}

type NavSection = 'files' | 'secrets' | 'settings';
type SelectedItem = { section: NavSection; key: string };

interface EdgeInspectorDialogProps {
    engine: EdgeEngine;
    providerId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extractWorkerName(engine: EdgeEngine): string {
    // engine_config has { worker_name: "..." }
    try {
        const cfg = typeof engine.engine_config === 'string'
            ? JSON.parse(engine.engine_config)
            : engine.engine_config;
        if (cfg?.worker_name) return cfg.worker_name;
    } catch { /* fallback */ }
    // Fallback: strip "Cloudflare: " prefix
    return engine.name.replace(/^(Cloudflare|CF):\s*/i, '').trim();
}

// ─── Static Endpoint Definitions (baked into the bundle per adapter type) ────

interface EndpointDef {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    description: string;
    dynamic?: boolean; // True if serves user-published content
}

const LITE_ENDPOINTS: EndpointDef[] = [
    { method: 'GET', path: '/api/health', description: 'Health check' },
    { method: 'GET', path: '/api/openapi.json', description: 'OpenAPI 3.1 spec' },
    { method: 'GET', path: '/api/docs', description: 'Swagger UI' },
    { method: 'POST', path: '/api/deploy', description: 'Receive deployment config' },
    { method: 'POST', path: '/api/execute', description: 'Execute workflow action' },
    { method: 'POST', path: '/api/webhook/:name', description: 'Incoming webhooks (API key auth)' },
    { method: 'GET', path: '/api/executions', description: 'List workflow executions' },
];

const FULL_EXTRA_ENDPOINTS: EndpointDef[] = [
    { method: 'POST', path: '/api/import', description: 'Receive published pages' },
    { method: 'POST', path: '/api/data/execute', description: 'Data query proxy (DataRequest)' },
    { method: 'GET', path: '/api/cache/stats', description: 'Cache statistics' },
    { method: 'POST', path: '/api/cache/invalidate', description: 'Invalidate cached pages' },
    { method: 'GET', path: '/:slug', description: 'SSR page rendering', dynamic: true },
];

function getEndpointsForAdapter(adapterType: string): EndpointDef[] {
    const isFullAdapter = adapterType === 'full';
    return isFullAdapter ? [...LITE_ENDPOINTS, ...FULL_EXTRA_ENDPOINTS] : LITE_ENDPOINTS;
}

function getWorkerBaseUrl(engine: EdgeEngine): string {
    if (!engine.url) return '';
    const url = engine.url.startsWith('http') ? engine.url : `https://${engine.url}`;
    return url.replace(/\/$/, '');
}

// Extract OpenAPI path info for an endpoint
function getOpenApiInfo(spec: any, path: string, method: string): { summary?: string; requestBody?: any; responses?: any; parameters?: any } | null {
    if (!spec?.paths) return null;
    // Try exact match first, then try with parameter normalization
    const pathObj = spec.paths[path] || spec.paths[path.replace(/:([\w]+)/g, '{$1}')];
    if (!pathObj) return null;
    const op = pathObj[method.toLowerCase()];
    if (!op) return null;
    return {
        summary: op.summary || op.description,
        requestBody: op.requestBody,
        responses: op.responses,
        parameters: op.parameters,
    };
}

async function inspectFetch<T>(endpoint: string, providerId: string, workerName: string): Promise<T> {
    const resp = await fetch(`${API_BASE}/api/cloudflare/inspect/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId, worker_name: workerName }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.detail || `Failed to fetch ${endpoint}`);
    return data;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const EdgeInspectorDialog: React.FC<EdgeInspectorDialogProps> = ({ engine, providerId }) => {
    const [open, setOpen] = useState(false);

    // Navigation state
    const [expandedSections, setExpandedSections] = useState<Set<NavSection>>(new Set(['files']));
    const [selectedItem, setSelectedItem] = useState<SelectedItem>({ section: 'files', key: 'source' });

    const workerName = extractWorkerName(engine);
    const cacheKey = `${providerId}:${workerName}`;

    // ─── Cached queries (only fire when dialog is open) ─────────────────
    const {
        data: content,
        isLoading: loadingContent,
        error: contentError,
    } = useQuery<InspectContentResponse>({
        queryKey: ['edge-inspector', 'content', cacheKey],
        queryFn: () => inspectFetch<InspectContentResponse>('content', providerId, workerName),
        enabled: open && !!providerId,
        staleTime: 5 * 60 * 1000,  // 5 min cache
        retry: 1,
        refetchOnWindowFocus: false,
    });

    const {
        data: settings,
        isLoading: loadingSettings,
    } = useQuery<InspectSettingsResponse>({
        queryKey: ['edge-inspector', 'settings', cacheKey],
        queryFn: () => inspectFetch<InspectSettingsResponse>('settings', providerId, workerName),
        enabled: open && !!providerId,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });

    const {
        data: secrets,
        isLoading: loadingSecrets,
    } = useQuery<InspectSecretsResponse>({
        queryKey: ['edge-inspector', 'secrets', cacheKey],
        queryFn: () => inspectFetch<InspectSecretsResponse>('secrets', providerId, workerName),
        enabled: open && !!providerId,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });

    // Fetch live OpenAPI spec from the worker itself
    const workerBaseUrl = getWorkerBaseUrl(engine);
    const { data: openApiSpec } = useQuery<any>({
        queryKey: ['edge-inspector', 'openapi', workerBaseUrl],
        queryFn: async () => {
            const resp = await fetch(`${workerBaseUrl}/api/openapi.json`);
            if (!resp.ok) return null;
            return resp.json();
        },
        enabled: open && !!workerBaseUrl,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });

    const error = contentError ? (contentError as Error).message : null;

    const toggleSection = (section: NavSection) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };

    const isSelected = (section: NavSection, key: string) =>
        selectedItem.section === section && selectedItem.key === key;

    // ─── Left Panel: Navigation Tree ────────────────────────────────────────

    const leftPanel = (
        <div className="w-[220px] min-w-[220px] border-r border-border flex flex-col bg-muted/30">
            {/* Header */}
            <div className="px-3 py-2 border-b border-border">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inspector</div>
            </div>

            <ScrollArea className="flex-1">
                <div className="py-1">
                    {/* ── Files Section ─────────────────────────────────── */}
                    <button
                        onClick={() => toggleSection('files')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {expandedSections.has('files') ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <FileCode className="h-3.5 w-3.5" />
                        FILES
                        {loadingContent && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                    </button>
                    {expandedSections.has('files') && (
                        <div className="ml-2">
                            {content ? (
                                <button
                                    onClick={() => setSelectedItem({ section: 'files', key: 'source' })}
                                    className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('files', 'source')
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                        }`}
                                >
                                    <File className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{content.filename}</span>
                                    <span className="ml-auto text-[10px] opacity-60">
                                        {formatBytes(content.size_bytes)}
                                    </span>
                                </button>
                            ) : loadingContent ? (
                                <div className="px-3 py-1"><Skeleton className="h-4 w-full" /></div>
                            ) : null}
                        </div>
                    )}

                    {/* ── Secrets Section ───────────────────────────────── */}
                    <button
                        onClick={() => toggleSection('secrets')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mt-1"
                    >
                        {expandedSections.has('secrets') ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <Lock className="h-3.5 w-3.5" />
                        SECRETS
                        {secrets && (
                            <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">{secrets.secrets.length}</Badge>
                        )}
                        {loadingSecrets && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                    </button>
                    {expandedSections.has('secrets') && (
                        <div className="ml-2">
                            {secrets?.secrets.map(name => (
                                <button
                                    key={name}
                                    onClick={() => setSelectedItem({ section: 'secrets', key: name })}
                                    className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('secrets', name)
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                        }`}
                                >
                                    <Shield className="h-3 w-3 shrink-0 text-amber-500" />
                                    <span className="truncate font-mono">{name}</span>
                                </button>
                            ))}
                            {loadingSecrets && (
                                <div className="px-3 py-1 space-y-1">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                </div>
                            )}
                            {secrets && secrets.secrets.length === 0 && (
                                <div className="px-3 py-1 text-[10px] text-muted-foreground italic">No secrets deployed</div>
                            )}
                        </div>
                    )}

                    {/* ── Settings Section ──────────────────────────────── */}
                    <button
                        onClick={() => toggleSection('settings')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mt-1"
                    >
                        {expandedSections.has('settings') ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <Settings2 className="h-3.5 w-3.5" />
                        SETTINGS
                        {loadingSettings && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                    </button>
                    {expandedSections.has('settings') && settings && (
                        <div className="ml-2">
                            {[
                                { key: 'compatibility', icon: Cpu, label: 'Compatibility' },
                                { key: 'bindings', icon: Settings2, label: `Bindings (${settings.settings.bindings.length})` },
                                { key: 'endpoints', icon: Zap, label: `Endpoints (${getEndpointsForAdapter(engine.adapter_type || 'automations').length})` },
                                { key: 'routes', icon: Globe, label: `Routes (${settings.settings.routes.length})` },
                                { key: 'crons', icon: Clock, label: `Crons (${settings.settings.cron_triggers.length})` },
                            ].map(item => (
                                <button
                                    key={item.key}
                                    onClick={() => setSelectedItem({ section: 'settings', key: item.key })}
                                    className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('settings', item.key)
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                        }`}
                                >
                                    <item.icon className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {expandedSections.has('settings') && loadingSettings && (
                        <div className="ml-2 px-3 py-1 space-y-1">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-4 w-5/6" />
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );

    // ─── Right Panel: Content Viewer ────────────────────────────────────────

    const renderRightPanel = () => {
        // Loading state
        if (selectedItem.section === 'files' && loadingContent) {
            return (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">Fetching worker source...</p>
                    </div>
                </div>
            );
        }

        // Error
        if (error) {
            return (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-3 max-w-sm">
                        <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                </div>
            );
        }

        // ── Source Code View ─────────────────────────────────────────────
        if (selectedItem.section === 'files' && content) {
            return (
                <div className="flex-1 flex flex-col min-w-0">
                    {/* File header */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
                        <div className="flex items-center gap-2 text-xs">
                            <FileCode className="h-3.5 w-3.5 text-blue-400" />
                            <span className="font-mono font-medium">{content.filename}</span>
                            <Badge variant="outline" className="text-[10px] h-4">{formatBytes(content.size_bytes)}</Badge>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">Read-only</Badge>
                    </div>
                    {/* Code content */}
                    <ScrollArea className="flex-1">
                        <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre overflow-x-auto text-foreground/90">
                            <code>{content.content}</code>
                        </pre>
                    </ScrollArea>
                </div>
            );
        }

        // ── Secret Detail View ───────────────────────────────────────────
        if (selectedItem.section === 'secrets') {
            return (
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                        <Shield className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs font-mono font-medium">{selectedItem.key}</span>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
                            <div className="flex items-center gap-2 mb-2">
                                <Lock className="h-4 w-4 text-amber-500" />
                                <span className="text-sm font-medium">Encrypted Secret</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                This secret is encrypted by Cloudflare and its value cannot be retrieved.
                                Secrets are injected as environment variables at runtime.
                            </p>
                            <div className="mt-3 p-2 rounded bg-background border font-mono text-xs">
                                <span className="text-muted-foreground">Value: </span>
                                <span className="text-amber-500">•••••••••••••••••</span>
                            </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            <p>To update this secret, redeploy the engine with new credentials or use the Cloudflare Dashboard.</p>
                        </div>
                    </div>
                </div>
            );
        }

        // ── Settings Detail Views ────────────────────────────────────────
        if (selectedItem.section === 'settings' && settings) {
            const s = settings.settings;

            if (selectedItem.key === 'compatibility') {
                return (
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                            <Cpu className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">Compatibility</span>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 rounded-lg border bg-card">
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Compatibility Date</div>
                                    <div className="text-sm font-mono font-medium">{s.compatibility_date}</div>
                                </div>
                                <div className="p-3 rounded-lg border bg-card">
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Usage Model</div>
                                    <div className="text-sm font-mono font-medium capitalize">{s.usage_model}</div>
                                </div>
                            </div>
                            {s.compatibility_flags.length > 0 && (
                                <div className="p-3 rounded-lg border bg-card">
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Compatibility Flags</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {s.compatibility_flags.map(flag => (
                                            <Badge key={flag} variant="outline" className="text-[10px] font-mono">{flag}</Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {Object.keys(s.placement).length > 0 && (
                                <div className="p-3 rounded-lg border bg-card">
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Smart Placement</div>
                                    <pre className="text-xs font-mono text-muted-foreground">{JSON.stringify(s.placement, null, 2)}</pre>
                                </div>
                            )}
                        </div>
                    </div>
                );
            }

            if (selectedItem.key === 'bindings') {
                return (
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                            <Settings2 className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">Bindings ({s.bindings.length})</span>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-2">
                                {s.bindings.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground text-sm">No bindings configured</div>
                                ) : (
                                    s.bindings.map((binding, i) => (
                                        <div key={i} className="p-3 rounded-lg border bg-card flex items-center gap-3">
                                            <Badge variant="outline" className="text-[10px] font-mono shrink-0 uppercase">{binding.type}</Badge>
                                            <span className="text-sm font-mono font-medium">{binding.name}</span>
                                            {binding.namespace_id && (
                                                <span className="text-[10px] text-muted-foreground font-mono ml-auto truncate max-w-[200px]">{binding.namespace_id}</span>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                );
            }

            if (selectedItem.key === 'routes') {
                return (
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                            <Globe className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">Routes ({s.routes.length})</span>
                        </div>
                        <div className="p-4 space-y-2">
                            {s.routes.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">No routes configured</div>
                            ) : (
                                s.routes.map((route, i) => (
                                    <div key={i} className="p-3 rounded-lg border bg-card flex items-center gap-3">
                                        <Badge variant="outline" className="text-[10px] font-mono shrink-0">{route.type}</Badge>
                                        <a
                                            href={`https://${route.pattern}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm font-mono text-primary hover:underline flex items-center gap-1.5 transition-colors"
                                        >
                                            {route.pattern}
                                            <ExternalLink className="h-3 w-3 opacity-60" />
                                        </a>
                                    </div>
                                ))
                            )}
                            <p className="text-[10px] text-muted-foreground italic mt-3">
                                Routes define how traffic reaches this worker. Add custom domains in the Cloudflare Dashboard.
                            </p>
                        </div>
                    </div>
                );
            }

            if (selectedItem.key === 'endpoints') {
                const endpoints = getEndpointsForAdapter(engine.adapter_type || 'automations');
                const methodColors: Record<string, string> = {
                    GET: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
                    POST: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
                    PUT: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
                    DELETE: 'text-red-500 bg-red-500/10 border-red-500/20',
                };
                return (
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
                            <div className="flex items-center gap-2">
                                <Zap className="h-3.5 w-3.5" />
                                <span className="text-xs font-medium">Endpoints ({endpoints.length})</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">{engine.adapter_type || 'automations'}</Badge>
                                {workerBaseUrl && (
                                    <a
                                        href={`${workerBaseUrl}/api/docs`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] text-primary hover:underline flex items-center gap-1"
                                    >
                                        Swagger UI <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                )}
                            </div>
                        </div>
                        <ScrollArea className="flex-1">
                            <Accordion type="multiple" className="px-4 py-2">
                                {endpoints.map((ep, i) => {
                                    const oaInfo = openApiSpec ? getOpenApiInfo(openApiSpec, ep.path, ep.method) : null;
                                    const fullUrl = workerBaseUrl ? `${workerBaseUrl}${ep.path}` : null;
                                    const isClickable = ep.method === 'GET' && fullUrl && !ep.path.includes(':');
                                    return (
                                        <AccordionItem key={i} value={`ep-${i}`} className="border-b-0 mb-1">
                                            <AccordionTrigger className="py-2 px-2.5 rounded-lg border bg-card hover:bg-accent/50 hover:no-underline [&[data-state=open]]:rounded-b-none">
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${methodColors[ep.method] || ''}`}>
                                                        {ep.method}
                                                    </span>
                                                    {isClickable ? (
                                                        <a
                                                            href={fullUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-sm font-mono font-medium text-primary hover:underline flex items-center gap-1"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            {ep.path}
                                                            <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-sm font-mono font-medium">{ep.path}</span>
                                                    )}
                                                    {ep.dynamic && <Badge variant="secondary" className="text-[10px] h-4">dynamic</Badge>}
                                                    <span className="text-[10px] text-muted-foreground ml-auto mr-2 hidden sm:inline">{ep.description}</span>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="px-2.5 pb-2.5 border border-t-0 rounded-b-lg bg-card">
                                                <div className="space-y-3 pt-2">
                                                    <p className="text-xs text-muted-foreground">{oaInfo?.summary || ep.description}</p>
                                                    {fullUrl && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-muted-foreground">URL:</span>
                                                            <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded break-all">{fullUrl}</code>
                                                        </div>
                                                    )}
                                                    {oaInfo?.requestBody && (
                                                        <div>
                                                            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Request Body</div>
                                                            <pre className="text-[10px] font-mono bg-muted p-2 rounded overflow-x-auto max-h-32">
                                                                {JSON.stringify(
                                                                    oaInfo.requestBody?.content?.['application/json']?.schema || oaInfo.requestBody,
                                                                    null, 2
                                                                )}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {oaInfo?.parameters && oaInfo.parameters.length > 0 && (
                                                        <div>
                                                            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Parameters</div>
                                                            <div className="space-y-1">
                                                                {oaInfo.parameters.map((p: any, j: number) => (
                                                                    <div key={j} className="flex items-center gap-2 text-[10px]">
                                                                        <Badge variant="outline" className="text-[9px] h-4">{p.in}</Badge>
                                                                        <code className="font-mono">{p.name}</code>
                                                                        {p.required && <span className="text-red-400">*</span>}
                                                                        <span className="text-muted-foreground">{p.schema?.type || ''}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {oaInfo?.responses && (
                                                        <div>
                                                            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Responses</div>
                                                            <div className="space-y-1">
                                                                {Object.entries(oaInfo.responses).map(([code, resp]: [string, any]) => (
                                                                    <div key={code} className="flex items-start gap-2 text-[10px]">
                                                                        <Badge variant={code.startsWith('2') ? 'default' : 'destructive'} className="text-[9px] h-4 shrink-0">{code}</Badge>
                                                                        <span className="text-muted-foreground">{resp.description || ''}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {!oaInfo && (
                                                        <p className="text-[10px] text-muted-foreground italic">No OpenAPI documentation available for this endpoint.</p>
                                                    )}
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    );
                                })}
                            </Accordion>
                            <div className="px-4 pb-4">
                                <p className="text-[10px] text-muted-foreground italic">
                                    Endpoints are baked into the bundle at build time. Publishing pages or automations
                                    uses existing endpoints — no new routes are created.
                                </p>
                            </div>
                        </ScrollArea>
                    </div>
                );
            }

            if (selectedItem.key === 'crons') {
                return (
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                            <Clock className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">Cron Triggers ({s.cron_triggers.length})</span>
                        </div>
                        <div className="p-4 space-y-2">
                            {s.cron_triggers.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">No cron triggers configured</div>
                            ) : (
                                s.cron_triggers.map((cron, i) => (
                                    <div key={i} className="p-3 rounded-lg border bg-card flex items-center gap-3">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-mono font-medium">{cron.cron}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                );
            }
        }

        // Default empty state
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                    <Search className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                    <p className="text-sm text-muted-foreground">Select an item to inspect</p>
                </div>
            </div>
        );
    };

    // ─── Dialog ─────────────────────────────────────────────────────────────

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="Inspect deployment">
                    <Search className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[900px] w-[90vw] h-[70vh] max-h-[600px] p-0 gap-0 flex flex-col overflow-hidden">
                {/* Header */}
                <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="text-sm flex items-center gap-2">
                                <Search className="h-4 w-4 text-primary" />
                                Inspect: {workerName}
                            </DialogTitle>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[10px]">{engine.provider || 'cloudflare'}</Badge>
                                <Badge variant="outline" className="text-[10px]">{engine.adapter_type}</Badge>
                                {engine.url && (
                                    <a
                                        href={engine.url.startsWith('http') ? engine.url : `https://${engine.url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                                    >
                                        {engine.url.replace(/^https?:\/\//, '')}
                                        <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* Split pane */}
                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {leftPanel}
                    {renderRightPanel()}
                </div>
            </DialogContent>
        </Dialog>
    );
};
