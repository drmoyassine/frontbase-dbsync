/**
 * ActionConfigurator - Component for binding actions to workflow
 * 
 * Used in property panels to configure what happens on component events.
 */

import React, { useState, useEffect } from 'react';
import { Play, Plus, Settings2, Trash2, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useWorkflowDrafts, useActionsStore } from '@/stores/actions';
import { cn } from '@/lib/utils';
import { WorkflowEditor } from '@/components/actions/editor/WorkflowEditor';

export interface ActionBinding {
    id: string;
    trigger: string; // was strict enum, relaxing for now or importing type
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
            workflowId: null,
            parameterMappings: {},
        };
        // Don't add to parent state yet, just open editor
        setEditingBinding(newBinding);
        setIsOpen(true);
    };

    const updateLocalBinding = (updates: Partial<ActionBinding>) => {
        if (editingBinding) {
            setEditingBinding({ ...editingBinding, ...updates });
        }
    };

    const saveBinding = () => {
        if (!editingBinding) return;

        const existingIndex = bindings.findIndex(b => b.id === editingBinding.id);
        if (existingIndex >= 0) {
            // Update existing
            const newBindings = [...bindings];
            newBindings[existingIndex] = editingBinding;
            onBindingsChange(newBindings);
        } else {
            // Add new
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

    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Actions</Label>
                <Button variant="outline" size="sm" onClick={addBinding}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add Action
                </Button>
            </div>

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
                                        <Play className="w-4 h-4 text-green-500" />
                                        <div>
                                            <div className="text-sm font-medium">
                                                {binding.trigger}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {binding.workflowName || (binding.workflowId ? 'Workflow configured' : 'Not configured')}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Dialog open={isOpen && editingBinding?.id === binding.id} onOpenChange={(open) => {
                                            if (!open) {
                                                setIsOpen(false);
                                                setEditingBinding(null);
                                            } else {
                                                setIsOpen(true);
                                                setEditingBinding({ ...binding }); // Clone to avoid direct mutation
                                            }
                                        }}>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                                    <Settings2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-md">
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
                                                                onValueChange={(v: any) => updateLocalBinding({ trigger: v })}
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

                                                        {/* Workflow Selection */}
                                                        <div className="space-y-2">
                                                            <Label>Workflow</Label>
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


                                                    </div>
                                                )}

                                                <div className="flex justify-end gap-2 mt-4">
                                                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                                                    <Button onClick={saveBinding}>Save</Button>
                                                </div>
                                            </DialogContent>
                                        </Dialog>

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
            {
                showEditor && (
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
                                // Auto-select if a new draft was created/published and matches current context
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
                )
            }
        </div >
    );
}
