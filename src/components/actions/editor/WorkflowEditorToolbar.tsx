/**
 * WorkflowEditorToolbar — Top toolbar for the workflow editor
 *
 * Contains: name/description inputs, save/test/publish buttons,
 * engine deployment dropdown, active status badge, settings, history toggle.
 *
 * Extracted from WorkflowEditor.tsx (L354-587) for single-responsibility compliance.
 */

import React from 'react';
import { Save, Play, Rocket, X, Loader2, ChevronDown, Server, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { WorkflowSettingsPanel, type WorkflowSettings } from './WorkflowSettingsPanel';
import { useActionsStore } from '@/stores/actions';
import { cn } from '@/lib/utils';

interface WorkflowEditorToolbarProps {
    // State
    draftName: string;
    description: string;
    isDirty: boolean;
    currentDraftId: string | null;
    draft: any;
    engines: any[];
    workflowSettings: WorkflowSettings | null;
    isPollingResult: boolean;
    showHistory: boolean;
    historyTotal?: number;
    onClose?: () => void;

    // Pending states
    isSaving: boolean;
    isTesting: boolean;
    isPublishing: boolean;

    // Handlers
    onDescriptionChange: (value: string) => void;
    onSettingsChange: (settings: WorkflowSettings) => void;
    onSave: () => void;
    onTest: () => void;
    onPublish: () => void;
    onPublishToEngine: (engineId: string, engineName: string) => void;
    onToggleActive: (active: boolean) => void;
    onToggleTargetActive: (draftId: string, engineId: string, active: boolean) => void;
    onClose_handler: () => void;
    onToggleHistory: () => void;
}

export function WorkflowEditorToolbar({
    draftName, description, isDirty, currentDraftId, draft, engines,
    workflowSettings, isPollingResult, showHistory, historyTotal,
    onClose,
    isSaving, isTesting, isPublishing,
    onDescriptionChange, onSettingsChange,
    onSave, onTest, onPublish, onPublishToEngine,
    onToggleActive, onToggleTargetActive,
    onClose_handler, onToggleHistory,
}: WorkflowEditorToolbarProps) {
    return (
        <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
            <div className="flex items-center gap-4">
                <Input
                    value={draftName}
                    onChange={(e) => useActionsStore.setState({ draftName: e.target.value, isDirty: true })}
                    className="w-64 font-medium"
                    placeholder="Workflow name"
                />
                <Input
                    value={description}
                    onChange={(e) => { onDescriptionChange(e.target.value); useActionsStore.setState({ isDirty: true }); }}
                    className="w-64 text-sm text-muted-foreground"
                    placeholder="Add description..."
                />

                {isDirty && (
                    <span className="text-xs text-muted-foreground">• Unsaved changes</span>
                )}
            </div>

            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onSave} disabled={isSaving}>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                </Button>

                <Button variant="outline" size="sm" onClick={onTest} disabled={isTesting || isPollingResult}>
                    {isPollingResult ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Running...
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4 mr-2" />
                            Test
                        </>
                    )}
                </Button>

                {/* Publish split button: primary + engine dropdown */}
                <div className="flex items-center">
                    <Button
                        size="sm"
                        onClick={onPublish}
                        disabled={isPublishing}
                        className="rounded-r-none"
                    >
                        <Rocket className="w-4 h-4 mr-2" />
                        Publish
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="sm"
                                disabled={isPublishing}
                                className="rounded-l-none border-l px-1.5"
                            >
                                <ChevronDown className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[240px]">
                            <DropdownMenuLabel className="text-xs text-muted-foreground uppercase opacity-80 pt-1 pb-1">Deploy to Engine</DropdownMenuLabel>
                            <DropdownMenuSeparator />

                            {/* Local Edge toggle */}
                            {(() => {
                                const localEdge = engines.find((e: any) => e.is_system && e.name === 'Local Edge');
                                if (!localEdge) return null;

                                const isDeployed = draft?.deployed_engines?.[localEdge.id];
                                const isActive = isDeployed?.is_active !== false;

                                return (
                                    <div className="flex items-center justify-between px-2 py-1.5 text-sm group">
                                        <div
                                            className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors flex-1"
                                            onClick={() => onPublishToEngine(localEdge.id, localEdge.name)}
                                            title="Push update to Local Edge"
                                        >
                                            <Server className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                                            <span>Local Edge</span>
                                        </div>
                                        <Switch
                                            checked={!!isDeployed && isActive}
                                            onCheckedChange={(checked) => {
                                                if (!isDeployed && checked) {
                                                    onPublishToEngine(localEdge.id, localEdge.name);
                                                } else {
                                                    onToggleTargetActive(currentDraftId!, localEdge.id, checked);
                                                }
                                            }}
                                            className="scale-75 shrink-0 m-0"
                                        />
                                    </div>
                                );
                            })()}

                            {/* Remote Engines */}
                            {engines.filter((e: any) => !e.is_system).map((engine: any) => {
                                const isDeployed = draft?.deployed_engines?.[engine.id];
                                const isActive = isDeployed?.is_active !== false;
                                return (
                                    <div key={engine.id} className="flex items-center justify-between px-2 py-1.5 text-sm group">
                                        <div
                                            className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors flex-1"
                                            onClick={() => onPublishToEngine(engine.id, engine.name)}
                                            title={`Push update to ${engine.name}`}
                                        >
                                            <Server className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                                            <span className="truncate">{engine.name}</span>
                                        </div>
                                        <Switch
                                            checked={!!isDeployed && isActive}
                                            onCheckedChange={(checked) => {
                                                if (!isDeployed && checked) {
                                                    onPublishToEngine(engine.id, engine.name);
                                                } else {
                                                    onToggleTargetActive(currentDraftId!, engine.id, checked);
                                                }
                                            }}
                                            className="scale-75 shrink-0 m-0"
                                        />
                                    </div>
                                );
                            })}
                            {engines.filter((e: any) => !e.is_system).length === 0 && (
                                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                                    No remote engines configured
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Active Badge Dropdown */}
                {draft && currentDraftId && (
                    <div className="flex flex-col items-center justify-center pl-2 ml-2 border-l">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Badge
                                    variant={!draft.is_published ? 'secondary' : (draft.is_active !== false ? 'default' : 'outline')}
                                    className={cn(
                                        "cursor-pointer transition-colors px-3 py-1 text-[13px]",
                                        !draft.is_published
                                            ? "bg-amber-500/15 text-amber-700 border-amber-200 hover:bg-amber-500/25"
                                            : (draft.is_active !== false
                                                ? "bg-emerald-500/15 text-emerald-700 border-emerald-200 hover:bg-emerald-500/25"
                                                : "text-muted-foreground hover:bg-muted")
                                    )}
                                >
                                    {!draft.is_published ? 'Draft' : (draft.is_active !== false ? 'Active' : 'Inactive')}
                                </Badge>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuLabel className="flex justify-between items-center font-normal">
                                    <span>Global Active State</span>
                                    <Switch
                                        checked={draft.is_active !== false}
                                        onCheckedChange={(checked) => onToggleActive(checked)}
                                        className="scale-75"
                                    />
                                </DropdownMenuLabel>
                                {draft.deployed_engines && Object.keys(draft.deployed_engines).length > 0 && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase opacity-80 pt-1 pb-1">
                                            Deployed Targets
                                        </DropdownMenuLabel>
                                        {Object.entries(draft.deployed_engines).map(([engineId, engine]: [string, any]) => (
                                            <div key={engineId} className="flex items-center justify-between px-2 py-1.5 text-sm">
                                                <div className="flex items-center gap-2 truncate pr-2">
                                                    <Server className="w-3.5 h-3.5 opacity-70" />
                                                    <span className="truncate">{engine.name}</span>
                                                </div>
                                                <Switch
                                                    checked={engine.is_active !== false}
                                                    disabled={draft.is_active === false}
                                                    onCheckedChange={(checked) => onToggleTargetActive(currentDraftId, engineId, checked)}
                                                    className="scale-75 shrink-0"
                                                />
                                            </div>
                                        ))}
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}

                {/* Workflow Settings */}
                <WorkflowSettingsPanel
                    settings={workflowSettings}
                    onSettingsChange={(s) => {
                        onSettingsChange(s);
                        useActionsStore.setState({ isDirty: true });
                    }}
                    hasDraft={!!currentDraftId}
                />

                {onClose && (
                    <Button variant="ghost" size="icon" onClick={onClose_handler}>
                        <X className="w-4 h-4" />
                    </Button>
                )}
                {/* History Toggle */}
                <Button
                    variant={showHistory ? 'default' : 'outline'}
                    size="sm"
                    onClick={onToggleHistory}
                    className="gap-1.5"
                >
                    <History className="w-4 h-4" />
                    History
                    {historyTotal ? (
                        <Badge variant="secondary" className="ml-0.5 text-xs h-5 px-1.5">
                            {historyTotal}
                        </Badge>
                    ) : null}
                </Button>
            </div>
        </div>
    );
}
