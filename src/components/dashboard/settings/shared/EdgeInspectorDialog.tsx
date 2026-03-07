/**
 * EdgeInspectorDialog — Mission Control Style
 *
 * Provider-agnostic inspector for deployed Edge Engines.
 * Split-pane layout: left panel (file tree + secrets + settings), right panel (Monaco editor / detail view).
 *
 * Phase 2: Full IDE with dirty state tracking, Save All, and Compile & Deploy.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Search, Loader2, AlertTriangle, ExternalLink, Save, Rocket, Circle, Check,
} from 'lucide-react';
import type { EdgeEngine } from '@/hooks/useEdgeInfrastructure';

// Sub-components
import { InspectorNavPanel } from './inspector/InspectorNavPanel';
import { SourceViewer } from './inspector/SourceViewer';
import { SecretViewer } from './inspector/SecretViewer';
import { SettingsPanel } from './inspector/SettingsPanel';
import { EndpointsPanel } from './inspector/EndpointsPanel';
import {
    type NavSection, type SelectedItem,
    type SourceSnapshotResponse, type InspectSettingsResponse, type InspectSecretsResponse,
    API_BASE, PROVIDER_LABELS,
    extractWorkerName, getWorkerBaseUrl, inspectFetch,
} from './inspector/types';

// ─── Props ──────────────────────────────────────────────────────────────────

interface EdgeInspectorDialogProps {
    engine: EdgeEngine;
    providerId: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const EdgeInspectorDialog: React.FC<EdgeInspectorDialogProps> = ({ engine, providerId }) => {
    const [open, setOpen] = useState(false);
    const queryClient = useQueryClient();

    // Navigation state
    const [expandedSections, setExpandedSections] = useState<Set<NavSection>>(new Set(['files']));
    const [selectedItem, setSelectedItem] = useState<SelectedItem>({ section: 'files', key: '' });
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

    // Edit state
    const [dirtyFiles, setDirtyFiles] = useState<Map<string, string>>(new Map());
    const [saving, setSaving] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const workerName = extractWorkerName(engine);
    const cacheKey = `${providerId}:${workerName}`;
    const isCF = (engine.provider || 'cloudflare') === 'cloudflare';
    const providerLabel = PROVIDER_LABELS[engine.provider || 'cloudflare'] || engine.provider || 'Provider';

    // ─── Source snapshot (provider-agnostic — reads from backend DB) ─────

    const {
        data: sourceData,
        isLoading: loadingSource,
        error: sourceError,
    } = useQuery<SourceSnapshotResponse>({
        queryKey: ['edge-inspector', 'source', engine.id],
        queryFn: async () => {
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engine.id}/source`);
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'No source snapshot available');
            return data;
        },
        enabled: open,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });

    // ─── CF-only queries (secrets + settings from CF Management API) ─────

    const {
        data: settings,
        isLoading: loadingSettings,
    } = useQuery<InspectSettingsResponse>({
        queryKey: ['edge-inspector', 'settings', cacheKey],
        queryFn: () => inspectFetch<InspectSettingsResponse>('settings', providerId, workerName),
        enabled: open && !!providerId && isCF,
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
        enabled: open && !!providerId && isCF,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });

    // Fetch live OpenAPI spec from the engine itself (provider-agnostic)
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

    const error = sourceError ? (sourceError as Error).message : null;

    // ─── Build file tree from snapshot keys ──────────────────────────────

    const fileTree = useMemo(() => {
        if (!sourceData?.files) return {};
        const tree: Record<string, string[]> = {};
        for (const path of Object.keys(sourceData.files).sort()) {
            const dir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '.';
            (tree[dir] ||= []).push(path);
        }
        return tree;
    }, [sourceData]);

    const fileTreeDirs = useMemo(() => Object.keys(fileTree).sort(), [fileTree]);

    // Auto-select first file when source loads
    const firstFile = useMemo(() => {
        if (!sourceData?.files) return '';
        const keys = Object.keys(sourceData.files).sort();
        return keys[0] || '';
    }, [sourceData]);

    React.useEffect(() => {
        if (firstFile && !selectedItem.key) {
            setSelectedItem({ section: 'files', key: firstFile });
            const dir = firstFile.includes('/') ? firstFile.substring(0, firstFile.lastIndexOf('/')) : '.';
            setExpandedDirs(new Set([dir]));
        }
    }, [firstFile]);

    const toggleDir = (dir: string) => {
        setExpandedDirs(prev => {
            const next = new Set(prev);
            if (next.has(dir)) next.delete(dir);
            else next.add(dir);
            return next;
        });
    };

    const toggleSection = (section: NavSection) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };

    // ─── Edit handlers ──────────────────────────────────────────────────

    const onContentChange = useCallback((filePath: string, newContent: string) => {
        // Only mark dirty if content actually differs from saved snapshot
        const savedContent = sourceData?.files[filePath];
        setDirtyFiles(prev => {
            const next = new Map(prev);
            if (newContent === savedContent) {
                next.delete(filePath);
            } else {
                next.set(filePath, newContent);
            }
            return next;
        });
    }, [sourceData]);

    const hasDirtyFiles = dirtyFiles.size > 0;
    const dirtyFileSet = useMemo(() => new Set(dirtyFiles.keys()), [dirtyFiles]);

    // ─── Save All ───────────────────────────────────────────────────────

    const handleSaveAll = useCallback(async () => {
        if (dirtyFiles.size === 0) return;
        setSaving(true);
        setStatusMessage(null);
        try {
            const files = Object.fromEntries(dirtyFiles);
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engine.id}/source`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Save failed');

            setDirtyFiles(new Map());
            queryClient.invalidateQueries({ queryKey: ['edge-inspector', 'source', engine.id] });
            setStatusMessage({ type: 'success', text: `Saved ${data.files_written} file(s)` });
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (e: any) {
            setStatusMessage({ type: 'error', text: e.message });
        } finally {
            setSaving(false);
        }
    }, [dirtyFiles, engine.id, queryClient]);

    // ─── Compile & Deploy ───────────────────────────────────────────────

    const handleCompileAndDeploy = useCallback(async () => {
        setDeploying(true);
        setStatusMessage(null);
        try {
            // Save first if there are dirty files
            if (dirtyFiles.size > 0) {
                const files = Object.fromEntries(dirtyFiles);
                const saveResp = await fetch(`${API_BASE}/api/edge-engines/${engine.id}/source`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files }),
                });
                if (!saveResp.ok) {
                    const err = await saveResp.json();
                    throw new Error(err.detail || 'Save failed before deploy');
                }
                setDirtyFiles(new Map());
            }

            // Trigger redeploy
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engine.id}/redeploy`, {
                method: 'POST',
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Deploy failed');

            queryClient.invalidateQueries({ queryKey: ['edge-inspector', 'source', engine.id] });
            setStatusMessage({ type: 'success', text: `Deployed! hash=${data.source_hash}` });
            setTimeout(() => setStatusMessage(null), 5000);
        } catch (e: any) {
            setStatusMessage({ type: 'error', text: e.message });
        } finally {
            setDeploying(false);
        }
    }, [dirtyFiles, engine.id, queryClient]);

    // ─── Right Panel: Content Viewer (delegated to sub-components) ───────

    const renderRightPanel = () => {
        // Loading state
        if (selectedItem.section === 'files' && loadingSource) {
            return (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">Loading source snapshot...</p>
                    </div>
                </div>
            );
        }

        // Error state
        if (error && selectedItem.section === 'files') {
            return (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-3 max-w-sm">
                        <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">{error}</p>
                        <p className="text-xs text-muted-foreground">Deploy or redeploy this engine to capture a source snapshot.</p>
                    </div>
                </div>
            );
        }

        // Source code editor
        if (selectedItem.section === 'files' && sourceData && selectedItem.key) {
            // Use dirty version if available, otherwise snapshot version
            const fileContent = dirtyFiles.get(selectedItem.key) ?? sourceData.files[selectedItem.key];
            if (fileContent === undefined) {
                return (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-sm text-muted-foreground">Select a file to view</p>
                    </div>
                );
            }
            return (
                <SourceViewer
                    filePath={selectedItem.key}
                    content={fileContent}
                    isDirty={dirtyFiles.has(selectedItem.key)}
                    onContentChange={onContentChange}
                />
            );
        }

        // Secret detail
        if (selectedItem.section === 'secrets') {
            return <SecretViewer secretName={selectedItem.key} providerLabel={providerLabel} />;
        }

        // Endpoints (provider-agnostic)
        if (selectedItem.section === 'settings' && selectedItem.key === 'endpoints') {
            return <EndpointsPanel engine={engine} openApiSpec={openApiSpec} />;
        }

        // Settings (CF-only)
        if (selectedItem.section === 'settings' && settings) {
            return <SettingsPanel settingsKey={selectedItem.key} settings={settings} />;
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

    // ─── Dialog ─────────────────────────────────────────────────────────

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="Inspect deployment">
                    <Search className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[1100px] w-[92vw] h-[80vh] max-h-[700px] p-0 gap-0 flex flex-col overflow-hidden">
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

                        {/* IDE Toolbar — only show when source is loaded */}
                        {sourceData && (
                            <div className="flex items-center gap-2">
                                {/* Status message */}
                                {statusMessage && (
                                    <span className={`text-[10px] ${statusMessage.type === 'success' ? 'text-emerald-500' : 'text-destructive'}`}>
                                        {statusMessage.type === 'success' && <Check className="h-3 w-3 inline mr-1" />}
                                        {statusMessage.text}
                                    </span>
                                )}

                                {/* Dirty count */}
                                {hasDirtyFiles && (
                                    <Badge variant="secondary" className="text-[10px] gap-1">
                                        <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />
                                        {dirtyFiles.size} unsaved
                                    </Badge>
                                )}

                                {/* Save All */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1.5"
                                    disabled={!hasDirtyFiles || saving}
                                    onClick={handleSaveAll}
                                >
                                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                    Save
                                </Button>

                                {/* Compile & Deploy */}
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="h-7 text-xs gap-1.5"
                                    disabled={deploying}
                                    onClick={handleCompileAndDeploy}
                                >
                                    {deploying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
                                    Compile & Deploy
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogHeader>

                {/* Split pane */}
                <div className="flex flex-1 min-h-0 overflow-hidden">
                    <InspectorNavPanel
                        sourceData={sourceData}
                        loadingSource={loadingSource}
                        fileTree={fileTree}
                        fileTreeDirs={fileTreeDirs}
                        expandedDirs={expandedDirs}
                        toggleDir={toggleDir}
                        secrets={secrets}
                        loadingSecrets={loadingSecrets}
                        settings={settings}
                        loadingSettings={loadingSettings}
                        isCF={isCF}
                        providerLabel={providerLabel}
                        adapterType={engine.adapter_type || 'automations'}
                        expandedSections={expandedSections}
                        toggleSection={toggleSection}
                        selectedItem={selectedItem}
                        setSelectedItem={setSelectedItem}
                        dirtyFiles={dirtyFileSet}
                    />
                    {renderRightPanel()}
                </div>
            </DialogContent>
        </Dialog>
    );
};
