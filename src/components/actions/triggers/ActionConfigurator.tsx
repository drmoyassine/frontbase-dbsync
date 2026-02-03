/**
 * ActionConfigurator - Component for binding actions to workflow
 * 
 * Used in property panels to configure what happens on component events.
 * Supports quick actions (scroll, navigate) and full workflow automation.
 */

import React, { useState } from 'react';
import { Play, Plus, Settings2, Trash2, X, Hash, ExternalLink, MousePointer, Workflow, Layers, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useWorkflowDrafts, useActionsStore } from '@/stores/actions';
import { cn } from '@/lib/utils';
import { WorkflowEditor } from '@/components/actions/editor/WorkflowEditor';
import { SelectTargetButton } from '@/components/builder/shared/SelectTargetButton';

// Action types for the hybrid configurator
export type ActionType = 'scrollToSection' | 'openPage' | 'openModal' | 'runWorkflow' | 'showTooltip';

export interface ActionConfig {
    sectionId?: string;      // For scrollToSection: e.g., "#features"
    pageUrl?: string;        // For openPage: e.g., "/pricing" or external URL
    openInNewTab?: boolean;  // For openPage: whether to open in new tab
    modalId?: string;        // For openModal (future)
    tooltipMessage?: string; // For showTooltip: tooltip text (supports @ variables)
}

export interface ActionBinding {
    id: string;
    trigger: string;
    actionType: ActionType;
    config?: ActionConfig;
    // Only used when actionType === 'runWorkflow'
    workflowId: string | null;
    workflowName?: string;
    parameterMappings: Record<string, ParameterMapping>;
    onSuccess?: SuccessAction;
    onError?: ErrorAction;
}

export interface ParameterMapping {
    source: 'static' | 'componentProp' | 'rowData' | 'formValues' | 'urlParams';
    path?: string;
    value?: any;
}

export interface SuccessAction {
    type: 'toast' | 'redirect' | 'refresh' | 'custom';
    message?: string;
    url?: string;
}

export interface ErrorAction {
    type: 'toast' | 'alert' | 'custom';
    message?: string;
}

interface ActionConfiguratorProps {
    componentId: string;
    componentType: string;
    bindings: ActionBinding[];
    onBindingsChange: (bindings: ActionBinding[]) => void;
    availableTriggers?: ActionBinding['trigger'][];
    className?: string;
}

// Helper to get display info for action types
const actionTypeInfo: Record<ActionType, { label: string; icon: React.ReactNode; description: string }> = {
    scrollToSection: {
        label: 'Scroll to Section',
        icon: <Hash className="w-4 h-4" />,
        description: 'Smooth scroll to a section on the page'
    },
    openPage: {
        label: 'Open Page',
        icon: <ExternalLink className="w-4 h-4" />,
        description: 'Navigate to another page or URL'
    },
    openModal: {
        label: 'Open Modal',
        icon: <Layers className="w-4 h-4" />,
        description: 'Coming Soon'
    },
    runWorkflow: {
        label: 'Run Workflow',
        icon: <Workflow className="w-4 h-4" />,
        description: 'Execute a custom automation workflow'
    },
    showTooltip: {
        label: 'Show Tooltip',
        icon: <MessageSquare className="w-4 h-4" />,
        description: 'Display a tooltip message on hover'
    }
};

// Helper to get binding display text
function getBindingDisplayText(binding: ActionBinding): string {
    switch (binding.actionType) {
        case 'scrollToSection':
            return binding.config?.sectionId || 'Scroll (not configured)';
        case 'openPage':
            return binding.config?.pageUrl || 'Navigate (not configured)';
        case 'openModal':
            return 'Modal (coming soon)';
        case 'runWorkflow':
            return binding.workflowName || (binding.workflowId ? 'Workflow configured' : 'Not configured');
        case 'showTooltip':
            return binding.config?.tooltipMessage
                ? `"${binding.config.tooltipMessage.substring(0, 30)}${binding.config.tooltipMessage.length > 30 ? '...' : ''}"`
                : 'Tooltip (not configured)';
        default:
            return 'Not configured';
    }
}

export function ActionConfigurator({
    componentId,
    componentType,
    bindings,
    onBindingsChange,
    availableTriggers = ['onClick'],
    className,
}: ActionConfiguratorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [editingBinding, setEditingBinding] = useState<ActionBinding | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const { currentDraftId, draftName } = useActionsStore();

    const { data: draftsData } = useWorkflowDrafts();
    const workflows = draftsData?.drafts || [];

    const addBinding = () => {
        const newBinding: ActionBinding = {
            id: `${componentId}-${Date.now()}`,
            trigger: availableTriggers[0],
            actionType: 'scrollToSection', // Default to most common quick action
            config: {},
            workflowId: null,
            parameterMappings: {},
        };
        setEditingBinding(newBinding);
        setIsOpen(true);
    };

    const updateLocalBinding = (updates: Partial<ActionBinding>) => {
        if (editingBinding) {
            setEditingBinding({ ...editingBinding, ...updates });
        }
    };

    const updateConfig = (configUpdates: Partial<ActionConfig>) => {
        if (editingBinding) {
            setEditingBinding({
                ...editingBinding,
                config: { ...editingBinding.config, ...configUpdates }
            });
        }
    };

    const saveBinding = () => {
        if (!editingBinding) return;

        const existingIndex = bindings.findIndex(b => b.id === editingBinding.id);
        if (existingIndex >= 0) {
            const newBindings = [...bindings];
            newBindings[existingIndex] = editingBinding;
            onBindingsChange(newBindings);
        } else {
            onBindingsChange([...bindings, editingBinding]);
        }
        setIsOpen(false);
        setEditingBinding(null);
    };

    const removeBinding = (id: string) => {
        onBindingsChange(bindings.filter(b => b.id !== id));
        if (editingBinding?.id === id) {
            setEditingBinding(null);
            setIsOpen(false);
        }
    };

    const openEditDialog = (binding: ActionBinding) => {
        setEditingBinding({ ...binding });
        setIsOpen(true);
    };

    const closeDialog = () => {
        setIsOpen(false);
        setEditingBinding(null);
    };

    // Render the action-specific configuration fields
    const renderActionConfig = () => {
        if (!editingBinding) return null;

        switch (editingBinding.actionType) {
            case 'scrollToSection':
                return (
                    <div className="space-y-2">
                        <Label>Section ID</Label>
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">#</span>
                            <Input
                                placeholder="section-id"
                                value={(editingBinding.config?.sectionId || '').replace(/^#/, '')}
                                onChange={(e) => updateConfig({ sectionId: `#${e.target.value.replace(/^#/, '')}` })}
                                className="flex-1"
                            />
                            <SelectTargetButton
                                onSelect={(sectionId) => {
                                    updateConfig({ sectionId: `#${sectionId}` });
                                }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Enter section ID or click the target icon to select from canvas
                        </p>
                    </div>
                );

            case 'openPage':
                return (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Page URL</Label>
                            <Input
                                placeholder="/pricing or https://example.com"
                                value={editingBinding.config?.pageUrl || ''}
                                onChange={(e) => updateConfig({ pageUrl: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="open-new-tab"
                                checked={editingBinding.config?.openInNewTab || false}
                                onCheckedChange={(checked) => updateConfig({ openInNewTab: !!checked })}
                            />
                            <Label htmlFor="open-new-tab" className="text-sm font-normal cursor-pointer">
                                Open in new tab
                            </Label>
                        </div>
                    </div>
                );

            case 'openModal':
                return (
                    <div className="rounded-md bg-muted p-4 text-center">
                        <Layers className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                            Modal actions are coming soon!
                        </p>
                    </div>
                );

            case 'runWorkflow':
                return (
                    <div className="space-y-2">
                        <Label>Workflow</Label>
                        <div className="flex gap-2">
                            <Select
                                disabled={workflows.length === 0}
                                value={editingBinding.workflowId || ''}
                                onValueChange={(v) => {
                                    const wf = workflows.find(w => w.id === v);
                                    updateLocalBinding({
                                        workflowId: v,
                                        workflowName: wf?.name
                                    });
                                }}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder={workflows.length === 0 ? "No workflows" : "Select workflow..."} />
                                </SelectTrigger>
                                <SelectContent>
                                    {workflows.map(wf => (
                                        <SelectItem key={wf.id} value={wf.id}>
                                            {wf.name}
                                            {wf.published_version && (
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    v{wf.published_version}
                                                </span>
                                            )}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setShowEditor(true)}
                                title={editingBinding.workflowId ? "Edit workflow" : "Create new workflow"}
                            >
                                {editingBinding.workflowId ? <Settings2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    // Shared dialog content for both new and existing bindings
    const renderDialogContent = () => (
        <>
            <DialogHeader>
                <DialogTitle>Configure Action</DialogTitle>
            </DialogHeader>

            {editingBinding && (
                <div className="space-y-4 py-4">
                    {/* Trigger Selection */}
                    <div className="space-y-2">
                        <Label>Trigger Event</Label>
                        <Select
                            value={editingBinding.trigger}
                            onValueChange={(v) => updateLocalBinding({ trigger: v })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {availableTriggers.map(t => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Action Type Selection */}
                    <div className="space-y-2">
                        <Label>Action Type</Label>
                        <Select
                            value={editingBinding.actionType}
                            onValueChange={(v: ActionType) => updateLocalBinding({ actionType: v })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(actionTypeInfo) as ActionType[]).map(type => (
                                    <SelectItem key={type} value={type} disabled={type === 'openModal'}>
                                        <div className="flex items-center gap-2">
                                            {actionTypeInfo[type].icon}
                                            <span>{actionTypeInfo[type].label}</span>
                                            {type === 'openModal' && (
                                                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Soon</span>
                                            )}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Action-specific Configuration */}
                    {renderActionConfig()}
                </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button
                    onClick={saveBinding}
                    disabled={editingBinding?.actionType === 'openModal'}
                >
                    Save
                </Button>
            </div>
        </>
    );

    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Actions</Label>
                <Button variant="outline" size="sm" onClick={addBinding}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add Action
                </Button>
            </div>

            {/* Dialog for new bindings */}
            <Dialog
                open={isOpen && editingBinding !== null && !bindings.some(b => b.id === editingBinding.id)}
                onOpenChange={(open) => {
                    if (!open) closeDialog();
                }}
            >
                <DialogContent className="max-w-md">
                    {renderDialogContent()}
                </DialogContent>
            </Dialog>

            {/* Dialog for existing bindings */}
            <Dialog
                open={isOpen && editingBinding !== null && bindings.some(b => b.id === editingBinding.id)}
                onOpenChange={(open) => {
                    if (!open) closeDialog();
                }}
            >
                <DialogContent className="max-w-md">
                    {renderDialogContent()}
                </DialogContent>
            </Dialog>

            {bindings.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                    No actions configured. Add one to trigger workflows.
                </div>
            ) : (
                <div className="space-y-2">
                    {bindings.map((binding) => (
                        <Card key={binding.id} className="group">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="text-green-500">
                                            {actionTypeInfo[binding.actionType]?.icon || <Play className="w-4 h-4" />}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">
                                                {binding.trigger} → {actionTypeInfo[binding.actionType]?.label || 'Action'}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {getBindingDisplayText(binding)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => openEditDialog(binding)}
                                        >
                                            <Settings2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive"
                                            onClick={() => removeBinding(binding.id)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Fullscreen Workflow Editor Overlay */}
            {showEditor && (
                <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in fade-in duration-200">
                    <div className="border-b p-2 flex justify-between items-center bg-card">
                        <div className="flex items-center gap-2 px-2">
                            <span className="font-semibold">Workflow Editor</span>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                {editingBinding?.trigger} Automation
                            </span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => {
                            setShowEditor(false);
                            if (currentDraftId && editingBinding) {
                                const wf = workflows.find(w => w.id === currentDraftId);
                                updateLocalBinding({
                                    workflowId: currentDraftId,
                                    workflowName: wf?.name || draftName || 'New Workflow'
                                });
                            }
                        }}>
                            <X className="w-4 h-4 mr-2" />
                            Close & Return
                        </Button>
                    </div>
                    <WorkflowEditor
                        draftId={editingBinding?.workflowId}
                        onClose={() => setShowEditor(false)}
                        className="flex-1"
                        hideTriggers={true}
                        initialTriggerType="manual"
                        initialTriggerLabel={editingBinding?.trigger}
                    />
                </div>
            )}
        </div>
    );
}
