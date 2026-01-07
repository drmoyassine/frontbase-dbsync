/**
 * WorkflowEditor - Main Editor Component
 * 
 * Combines the canvas, palette, and properties pane into a complete editor.
 */

import React, { useEffect } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { Save, Play, Rocket, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { WorkflowCanvas } from './WorkflowCanvas';
import { NodePalette } from './NodePalette';
import { PropertiesPane } from './PropertiesPane';
import { useActionsStore } from '@/stores/actions';
import {
    useWorkflowDraft,
    useCreateDraft,
    useUpdateDraft,
    usePublishDraft,
    useTestDraft
} from '@/stores/actions';
import { cn } from '@/lib/utils';

interface WorkflowEditorProps {
    draftId?: string | null;
    onClose?: () => void;
    className?: string;
    hideTriggers?: boolean;
    initialTriggerType?: string;
    initialTriggerLabel?: string;
}

export function WorkflowEditor({
    draftId,
    onClose,
    className,
    hideTriggers,
    initialTriggerType,
    initialTriggerLabel
}: WorkflowEditorProps) {
    const { toast } = useToast();

    const {
        currentDraftId,
        draftName,
        triggerType,
        nodes,
        edges,
        isDirty,
        selectedNodeId,
        setCurrentDraft,
        setTriggerType,
        setNodes,
        setEdges,
        markClean,
        resetEditor,
    } = useActionsStore();

    // API hooks
    const { data: draft } = useWorkflowDraft(draftId || currentDraftId);
    const createDraft = useCreateDraft();
    const updateDraft = useUpdateDraft();
    const publishDraft = usePublishDraft();
    const testDraft = useTestDraft();

    // Load draft data when available
    useEffect(() => {
        if (draft) {
            setCurrentDraft(draft.id, draft.name);
            setNodes(draft.nodes.map((n, i) => ({
                id: n.id,
                type: n.type === 'manual_trigger' ? 'trigger' : n.type,
                position: n.position,
                data: {
                    label: n.name,
                    type: n.type,
                    inputs: n.inputs,
                    outputs: n.outputs,
                },
            })));
            setEdges(draft.edges.map((e) => ({
                id: `${e.source}-${e.target}`,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceOutput,
                targetHandle: e.targetInput,
                animated: true,
            })));
            markClean();
        } else if (!draftId && initialTriggerType) {
            // Contextual initialization for new drafts
            useActionsStore.setState({
                draftName: `${initialTriggerLabel || 'New'} Automation`,
                triggerType: initialTriggerType as any
            });

            // Auto-place trigger node
            setNodes([{
                id: 'trigger-init',
                type: 'trigger',
                position: { x: 300, y: 100 },
                data: {
                    label: initialTriggerLabel || 'Trigger',
                    type: initialTriggerType === 'manual' ? 'manual_trigger' : 'trigger',
                    inputs: [],
                    outputs: [{ name: 'Trigger Output', type: 'any' }]
                }
            }]);
        }
    }, [draft, draftId, initialTriggerType, initialTriggerLabel, setCurrentDraft, setTriggerType, setNodes, setEdges, markClean]);

    // Save handler
    const handleSave = async () => {
        const workflowData = {
            name: draftName,
            trigger_type: triggerType,
            nodes: nodes.map((n) => ({
                id: n.id,
                name: n.data.label,
                type: n.data.type,
                position: n.position,
                inputs: n.data.inputs,
                outputs: n.data.outputs,
            })),
            edges: edges.map((e) => ({
                source: e.source,
                target: e.target,
                sourceOutput: e.sourceHandle || 'output',
                targetInput: e.targetHandle || 'input',
            })),
        };

        try {
            if (currentDraftId) {
                await updateDraft.mutateAsync({ id: currentDraftId, ...workflowData });
                toast({ title: 'Saved', description: 'Workflow saved successfully' });
            } else {
                const result = await createDraft.mutateAsync(workflowData);
                setCurrentDraft(result.id, result.name);
                toast({ title: 'Created', description: 'Workflow created successfully' });
            }
            markClean();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    };

    // Test handler
    const handleTest = async () => {
        if (!currentDraftId) {
            toast({ title: 'Save first', description: 'Please save the workflow before testing', variant: 'destructive' });
            return;
        }

        try {
            const result = await testDraft.mutateAsync({ id: currentDraftId });
            toast({
                title: 'Test Started',
                description: `Execution ID: ${result.execution_id}`
            });
        } catch (error: any) {
            toast({ title: 'Test Failed', description: error.message, variant: 'destructive' });
        }
    };

    // Publish handler
    const handlePublish = async () => {
        if (!currentDraftId) {
            toast({ title: 'Save first', description: 'Please save the workflow before publishing', variant: 'destructive' });
            return;
        }

        // Save first if dirty
        if (isDirty) {
            await handleSave();
        }

        try {
            const result = await publishDraft.mutateAsync(currentDraftId);
            toast({
                title: 'Published!',
                description: `Version ${result.version} deployed to runtime`
            });
        } catch (error: any) {
            toast({ title: 'Publish Failed', description: error.message, variant: 'destructive' });
        }
    };

    // Close handler
    const handleClose = () => {
        if (isDirty) {
            if (!confirm('You have unsaved changes. Discard them?')) return;
        }
        resetEditor();
        onClose?.();
    };

    return (
        <ReactFlowProvider>
            <div className={cn('flex flex-col h-full bg-background', className)}>
                {/* Toolbar */}
                <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
                    <div className="flex items-center gap-4">
                        <Input
                            value={draftName}
                            onChange={(e) => useActionsStore.setState({ draftName: e.target.value, isDirty: true })}
                            className="w-64 font-medium"
                            placeholder="Workflow name"
                        />

                        <Select value={triggerType} onValueChange={(v: any) => setTriggerType(v)}>
                            <SelectTrigger className="w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="manual">Manual</SelectItem>
                                <SelectItem value="http_webhook">Webhook</SelectItem>
                                <SelectItem value="scheduled">Scheduled</SelectItem>
                                <SelectItem value="data_change">Data Change</SelectItem>
                            </SelectContent>
                        </Select>

                        {isDirty && (
                            <span className="text-xs text-muted-foreground">• Unsaved changes</span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleSave} disabled={updateDraft.isPending || createDraft.isPending}>
                            <Save className="w-4 h-4 mr-2" />
                            Save
                        </Button>

                        <Button variant="outline" size="sm" onClick={handleTest} disabled={testDraft.isPending}>
                            <Play className="w-4 h-4 mr-2" />
                            Test
                        </Button>

                        <Button size="sm" onClick={handlePublish} disabled={publishDraft.isPending}>
                            <Rocket className="w-4 h-4 mr-2" />
                            Publish
                        </Button>

                        {onClose && (
                            <Button variant="ghost" size="icon" onClick={handleClose}>
                                <X className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Node Palette */}
                    <NodePalette hideTriggers={hideTriggers} />

                    {/* Center: Canvas */}
                    <WorkflowCanvas className="flex-1" />

                    {/* Right: Properties */}
                    {selectedNodeId && <PropertiesPane />}
                </div>
            </div>
        </ReactFlowProvider>
    );
}
