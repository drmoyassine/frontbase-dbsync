/**
 * InspectorNavPanel — Left panel navigation tree.
 *
 * Contains three collapsible sections: Files, Secrets, Settings.
 * Files section renders a directory-grouped file tree from the source snapshot.
 * Secrets/Settings sections are CF-only with graceful degradation.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    FileCode, Lock, Settings2, ChevronDown, ChevronRight,
    File, Folder, Shield, Globe, Clock, Cpu, Loader2, Zap, Info, Circle,
} from 'lucide-react';
import type {
    SourceSnapshotResponse, InspectSettingsResponse, InspectSecretsResponse,
    NavSection, SelectedItem,
} from './types';
import { getEndpointsForAdapter } from './types';

interface InspectorNavPanelProps {
    // File tree
    sourceData: SourceSnapshotResponse | undefined;
    loadingSource: boolean;
    fileTree: Record<string, string[]>;
    fileTreeDirs: string[];
    expandedDirs: Set<string>;
    toggleDir: (dir: string) => void;
    // Secrets (CF-only)
    secrets: InspectSecretsResponse | undefined;
    loadingSecrets: boolean;
    // Settings
    settings: InspectSettingsResponse | undefined;
    loadingSettings: boolean;
    isCF: boolean;
    providerLabel: string;
    adapterType: string;
    // Section expand/collapse
    expandedSections: Set<NavSection>;
    toggleSection: (section: NavSection) => void;
    // Selection
    selectedItem: SelectedItem;
    setSelectedItem: (item: SelectedItem) => void;
    // Dirty files (edited but unsaved)
    dirtyFiles?: Set<string>;
}

export const InspectorNavPanel: React.FC<InspectorNavPanelProps> = ({
    sourceData, loadingSource, fileTree, fileTreeDirs, expandedDirs, toggleDir,
    secrets, loadingSecrets,
    settings, loadingSettings, isCF, providerLabel, adapterType,
    expandedSections, toggleSection,
    selectedItem, setSelectedItem,
    dirtyFiles,
}) => {
    const isSelected = (section: NavSection, key: string) =>
        selectedItem.section === section && selectedItem.key === key;

    return (
        <div className="w-[220px] min-w-[220px] border-r border-border flex flex-col bg-muted/30">
            {/* Header */}
            <div className="px-3 py-2 border-b border-border">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inspector</div>
            </div>

            <ScrollArea className="flex-1">
                <div className="py-1">
                    {/* ── Files Section (provider-agnostic source snapshot) ── */}
                    <button
                        onClick={() => toggleSection('files')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {expandedSections.has('files') ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <FileCode className="h-3.5 w-3.5" />
                        FILES
                        {sourceData && (
                            <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">{sourceData.file_count}</Badge>
                        )}
                        {loadingSource && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                    </button>
                    {expandedSections.has('files') && (
                        <div className="ml-1">
                            {sourceData ? fileTreeDirs.map(dir => (
                                <div key={dir}>
                                    <button
                                        onClick={() => toggleDir(dir)}
                                        className="w-full flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {expandedDirs.has(dir) ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                                        <Folder className="h-3 w-3 shrink-0 text-blue-400" />
                                        <span className="truncate">{dir === '.' ? 'src' : dir}</span>
                                    </button>
                                    {expandedDirs.has(dir) && fileTree[dir]?.map(filePath => {
                                        const fileName = filePath.includes('/') ? filePath.substring(filePath.lastIndexOf('/') + 1) : filePath;
                                        return (
                                            <button
                                                key={filePath}
                                                onClick={() => setSelectedItem({ section: 'files', key: filePath })}
                                                className={`w-full flex items-center gap-1.5 pl-7 pr-2 py-0.5 text-[11px] rounded-sm transition-colors ${isSelected('files', filePath)
                                                    ? 'bg-primary/10 text-primary font-medium'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                                    }`}
                                            >
                                                <File className="h-3 w-3 shrink-0" />
                                                <span className="truncate font-mono">{fileName}</span>
                                                {dirtyFiles?.has(filePath) && (
                                                    <Circle className="h-1.5 w-1.5 fill-amber-500 text-amber-500 ml-auto shrink-0" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )) : loadingSource ? (
                                <div className="px-3 py-1 space-y-1">
                                    <Skeleton className="h-3 w-full" />
                                    <Skeleton className="h-3 w-3/4" />
                                    <Skeleton className="h-3 w-5/6" />
                                </div>
                            ) : (
                                <div className="px-3 py-1 text-[10px] text-muted-foreground italic">No source snapshot — deploy to capture</div>
                            )}
                        </div>
                    )}

                    {/* ── Secrets Section (CF-only) ───────────────────── */}
                    {isCF && (
                        <>
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
                        </>
                    )}

                    {/* ── Settings Section ──────────────────────────── */}
                    <button
                        onClick={() => toggleSection('settings')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mt-1"
                    >
                        {expandedSections.has('settings') ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <Settings2 className="h-3.5 w-3.5" />
                        SETTINGS
                        {isCF && loadingSettings && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                    </button>
                    {expandedSections.has('settings') && (
                        <div className="ml-2">
                            {/* Endpoints — always available (provider-agnostic) */}
                            <button
                                onClick={() => setSelectedItem({ section: 'settings', key: 'endpoints' })}
                                className={`w-full flex items-center gap-2 px-3 py-1 text-xs rounded-md transition-colors ${isSelected('settings', 'endpoints')
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                    }`}
                            >
                                <Zap className="h-3 w-3 shrink-0" />
                                <span className="truncate">Endpoints ({getEndpointsForAdapter(adapterType).length})</span>
                            </button>

                            {/* CF-only settings items */}
                            {isCF && settings && [
                                { key: 'compatibility', icon: Cpu, label: 'Compatibility' },
                                { key: 'bindings', icon: Settings2, label: `Bindings (${settings.settings.bindings.length})` },
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

                            {/* Non-CF: info message */}
                            {!isCF && (
                                <div className="px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-1.5">
                                    <Info className="h-3 w-3 shrink-0" />
                                    Bindings/routes via {providerLabel} Dashboard
                                </div>
                            )}

                            {isCF && loadingSettings && (
                                <div className="px-3 py-1 space-y-1">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
};
