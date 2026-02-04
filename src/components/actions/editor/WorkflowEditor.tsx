/**
 * WorkflowEditor - Main Editor Component
 * 
 * Combines the canvas, palette, and properties pane into a complete editor.
 */

import React, { useEffect, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { Save, Play, Rocket, X, Plus, Loader2 } from 'lucide-react';
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
    useTestDraft,
    useExecutionResult
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

    // Execution state for test results
    const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
    const { data: executionResult, isLoading: isPollingResult } = useExecutionResult(currentExecutionId);

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

        // Save first if dirty
        if (isDirty) {
            await handleSave();
        }

        try {
            setCurrentExecutionId(null); // Reset previous result
            const result = await testDraft.mutateAsync({ id: currentDraftId });
            setCurrentExecutionId(result.execution_id);
            toast({
                title: 'Test Running',
                description: 'Executing workflow...'
            });
        } catch (error: any) {
            toast({ title: 'Test Failed', description: error.message, variant: 'destructive' });
        }
    };

    // Show toast when execution completes
    useEffect(() => {
        if (executionResult?.status === 'completed') {
            toast({
                title: '✅ Test Complete',
                description: `Workflow finished successfully`,
            });
        } else if (executionResult?.status === 'error') {
            toast({
                title: '❌ Test Failed',
                description: executionResult.error || 'Execution error',
                variant: 'destructive',
            });
        }
    }, [executionResult?.status]);

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

                        <Button variant="outline" size="sm" onClick={handleTest} disabled={testDraft.isPending || isPollingResult}>
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
                    <div className="flex-1 flex flex-col">
                        <WorkflowCanvas className="flex-1" />

                        {/* Execution Result Panel */}
                        {executionResult && (
                            <div className={cn(
                                "border-t p-4 max-h-64 overflow-auto bg-muted/30",
                                executionResult.status === 'completed' && "bg-green-50 dark:bg-green-950/20",
                                executionResult.status === 'error' && "bg-red-50 dark:bg-red-950/20"
                            )}>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold">
                                        {executionResult.status === 'executing' && '⏳ Executing...'}
                                        {executionResult.status === 'completed' && '✅ Execution Complete'}
                                        {executionResult.status === 'error' && '❌ Execution Failed'}
                                    </h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setCurrentExecutionId(null)}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>

                                {executionResult.error && (
                                    <div className="text-sm text-red-600 dark:text-red-400 mb-2">
                                        {executionResult.error}
                                    </div>
                                )}

                                {executionResult.result && (
                                    <div className="text-xs">
                                        <div className="text-muted-foreground mb-1">Result:</div>
                                        <pre className="bg-background p-2 rounded border overflow-auto max-h-32 text-xs">
                                            {JSON.stringify(executionResult.result, null, 2)}
                                        </pre>
                                    </div>
                                )}

                                {executionResult.nodeExecutions && executionResult.nodeExecutions.length > 0 && (
                                    <div className="text-xs mt-2">
                                        <div className="text-muted-foreground mb-1">Node Outputs:</div>
                                        {executionResult.nodeExecutions.filter(n => n.outputs).map(node => (
                                            <details key={node.nodeId} className="mb-1">
                                                <summary className="cursor-pointer text-sm">
                                                    {node.status === 'completed' ? '✅' : node.status === 'error' ? '❌' : '⏳'} Node: {node.nodeId.slice(0, 8)}
                                                </summary>
                                                <pre className="bg-background p-2 rounded border overflow-auto max-h-24 text-xs ml-4">
                                                    {JSON.stringify(node.outputs, null, 2)}
                                                </pre>
                                            </details>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right: Properties */}
                    {selectedNodeId && <PropertiesPane />}
                </div>
            </div>
        </ReactFlowProvider>
    );
}
