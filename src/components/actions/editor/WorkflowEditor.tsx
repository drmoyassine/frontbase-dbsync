/**
 * WorkflowEditor - Main Editor Component
 * 
 * Combines the canvas, palette, and properties pane into a complete editor.
 */

import React, { useEffect, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { Save, Play, Rocket, X, Plus, Loader2, ChevronDown, Server, History, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useEdgeEngines } from '@/hooks/useEdgeInfrastructure';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { WorkflowCanvas } from './WorkflowCanvas';
import { NodePalette } from './NodePalette';
import { PropertiesPane } from './PropertiesPane';
import { RecordViewer } from './RecordViewer';
import { ExecutionLogTable } from '@/components/actions/ExecutionLogTable';
import { WorkflowSettingsPanel, type WorkflowSettings } from './WorkflowSettingsPanel';
import { useActionsStore } from '@/stores/actions';
import {
    useWorkflowDraft,
    useCreateDraft,
    useUpdateDraft,
    usePublishDraft,
    usePublishDraftToEngine,
    useToggleDraftActive,
    useToggleTargetActive,
    useTestDraft,
    useTestNode,
    useExecutionResult,
    useDraftExecutions,
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
        nodes,
        edges,
        isDirty,
        selectedNodeId,
        setCurrentDraft,
        setNodes,
        setEdges,
        markClean,
        resetEditor,
    } = useActionsStore();

    // Execution state for test results
    const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
    const { data: executionResult, isLoading: isPollingResult } = useExecutionResult(currentExecutionId);

    // History panel state
    const [showHistory, setShowHistory] = useState(false);
    const { data: historyData } = useDraftExecutions(draftId || currentDraftId);

    // API hooks
    const { data: draft } = useWorkflowDraft(draftId || currentDraftId);
    const createDraft = useCreateDraft();
    const updateDraft = useUpdateDraft();
    const publishDraft = usePublishDraft();
    const publishToEngine = usePublishDraftToEngine();
    const toggleActive = useToggleDraftActive();
    const toggleTargetActive = useToggleTargetActive();
    const testDraft = useTestDraft();
    const testNode = useTestNode();

    // Edge engines for publish dropdown
    const { data: engines = [] } = useEdgeEngines();

    // Description state (initialized from draft)
    const [description, setDescription] = useState<string>('');

    // Workflow settings state
    const [workflowSettings, setWorkflowSettings] = useState<WorkflowSettings | null>(null);

    // Load draft data when available
    useEffect(() => {
        if (draft) {
            setCurrentDraft(draft.id, draft.name);
            setDescription(draft.description || '');
            setWorkflowSettings(draft.settings as WorkflowSettings || null);
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
    }, [draft, draftId, initialTriggerType, initialTriggerLabel, setCurrentDraft, setNodes, setEdges, markClean]);

    // Save handler
    const handleSave = async () => {
        // Derive trigger_type from trigger nodes on canvas
        const TRIGGER_TYPE_MAP: Record<string, string> = {
            trigger: 'manual',
            manual_trigger: 'manual',
            webhook_trigger: 'http_webhook',
            schedule_trigger: 'scheduled',
            data_change_trigger: 'data_change',
        };
        const triggerNodes = nodes.filter(n => TRIGGER_TYPE_MAP[n.data.type]);
        const derivedTriggerType = [...new Set(triggerNodes.map(n => TRIGGER_TYPE_MAP[n.data.type]))].join(',') || 'manual';

        // Build trigger_config map keyed by trigger node ID (Option A)
        const triggerConfig: Record<string, Record<string, any>> = {};
        for (const tn of triggerNodes) {
            const inputs: Record<string, any> = {};
            if (Array.isArray(tn.data.inputs)) {
                for (const inp of tn.data.inputs) {
                    if (inp.name && inp.value !== undefined) {
                        inputs[inp.name] = inp.value;
                    }
                }
            }
            triggerConfig[tn.id] = inputs;
        }

        const workflowData = {
            name: draftName,
            description: description || null,
            trigger_type: derivedTriggerType,
            trigger_config: triggerConfig,
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
            ...(workflowSettings ? { settings: workflowSettings } : {}),
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
            const detail = error?.response?.data?.detail || error?.message || 'Unknown error';
            toast({ title: 'Save Failed', description: typeof detail === 'object' ? JSON.stringify(detail) : String(detail), variant: 'destructive' });
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

    // Test single node handler
    const [isTestingNode, setIsTestingNode] = useState(false);
    const handleTestNode = async (nodeId: string) => {
        if (!currentDraftId) {
            toast({ title: 'Save first', description: 'Please save the workflow before testing', variant: 'destructive' });
            return;
        }

        // Save first if dirty
        if (isDirty) {
            await handleSave();
        }

        try {
            setIsTestingNode(true);
            setCurrentExecutionId(null);
            // Execute only the selected node (and its upstream dependencies)
            const result = await testNode.mutateAsync({
                draftId: currentDraftId,
                nodeId
            });
            setCurrentExecutionId(result.execution_id);
            toast({
                title: 'Testing Node',
                description: 'Executing node and its dependencies...'
            });
        } catch (error: any) {
            toast({ title: 'Test Failed', description: error.message, variant: 'destructive' });
        } finally {
            setIsTestingNode(false);
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

    // Publish handler (local edge)
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
                description: `Version ${result.version} deployed to local edge`
            });
            markClean();
        } catch (error: any) {
            toast({ title: 'Publish Failed', description: error.message, variant: 'destructive' });
        }
    };

    // Publish to specific engine handler
    const handlePublishToEngine = async (engineId: string, engineName: string) => {
        if (!currentDraftId) {
            toast({ title: 'Save first', description: 'Please save the workflow before publishing', variant: 'destructive' });
            return;
        }

        if (isDirty) {
            await handleSave();
        }

        try {
            const result = await publishToEngine.mutateAsync({ draftId: currentDraftId, engineId });
            toast({
                title: 'Published!',
                description: result.message || `Deployed to ${engineName}`
            });
            markClean();
        } catch (error: any) {
            const detail = error?.response?.data?.detail || error?.message || 'Unknown error';
            toast({ title: 'Publish Failed', description: typeof detail === 'object' ? JSON.stringify(detail) : String(detail), variant: 'destructive' });
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
                        <Input
                            value={description}
                            onChange={(e) => { setDescription(e.target.value); useActionsStore.setState({ isDirty: true }); }}
                            className="w-64 text-sm text-muted-foreground"
                            placeholder="Add description..."
                        />

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

                        {/* Publish split button: primary + engine dropdown */}
                        <div className="flex items-center">
                            <Button
                                size="sm"
                                onClick={handlePublish}
                                disabled={publishDraft.isPending || publishToEngine.isPending}
                                className="rounded-r-none"
                            >
                                <Rocket className="w-4 h-4 mr-2" />
                                Publish
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        size="sm"
                                        disabled={publishDraft.isPending || publishToEngine.isPending}
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
                                        const localEdge = engines.find(e => e.is_system && e.name === 'Local Edge');
                                        if (!localEdge) return null;

                                        const isDeployed = draft?.deployed_engines?.[localEdge.id];
                                        const isActive = isDeployed?.is_active !== false;

                                        return (
                                            <div className="flex items-center justify-between px-2 py-1.5 text-sm group">
                                                <div
                                                    className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors flex-1"
                                                    onClick={() => handlePublishToEngine(localEdge.id, localEdge.name)}
                                                    title="Push update to Local Edge"
                                                >
                                                    <Server className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                                                    <span>Local Edge</span>
                                                </div>
                                                <Switch
                                                    checked={!!isDeployed && isActive}
                                                    onCheckedChange={(checked) => {
                                                        if (!isDeployed && checked) {
                                                            handlePublishToEngine(localEdge.id, localEdge.name);
                                                        } else {
                                                            toggleTargetActive.mutate({
                                                                draftId: currentDraftId,
                                                                engineId: localEdge.id,
                                                                is_active: checked
                                                            });
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
                                                    onClick={() => handlePublishToEngine(engine.id, engine.name)}
                                                    title={`Push update to ${engine.name}`}
                                                >
                                                    <Server className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                                                    <span className="truncate">{engine.name}</span>
                                                </div>
                                                <Switch
                                                    checked={!!isDeployed && isActive}
                                                    onCheckedChange={(checked) => {
                                                        if (!isDeployed && checked) {
                                                            handlePublishToEngine(engine.id, engine.name);
                                                        } else {
                                                            toggleTargetActive.mutate({
                                                                draftId: currentDraftId,
                                                                engineId: engine.id,
                                                                is_active: checked
                                                            });
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
                                                onCheckedChange={(checked) => toggleActive.mutate({ draftId: currentDraftId, isActive: checked })}
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
                                                            onCheckedChange={(checked) => toggleTargetActive.mutate({
                                                                draftId: currentDraftId,
                                                                engineId,
                                                                is_active: checked
                                                            })}
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
                                setWorkflowSettings(s);
                                useActionsStore.setState({ isDirty: true });
                            }}
                            hasDraft={!!currentDraftId}
                        />

                        {onClose && (
                            <Button variant="ghost" size="icon" onClick={handleClose}>
                                <X className="w-4 h-4" />
                            </Button>
                        )}
                        {/* History Toggle */}
                        <Button
                            variant={showHistory ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setShowHistory(!showHistory)}
                            className="gap-1.5"
                        >
                            <History className="w-4 h-4" />
                            History
                            {historyData?.total ? (
                                <Badge variant="secondary" className="ml-0.5 text-xs h-5 px-1.5">
                                    {historyData.total}
                                </Badge>
                            ) : null}
                        </Button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Node Palette */}
                    <NodePalette hideTriggers={hideTriggers} />

                    {/* Center: Canvas */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <WorkflowCanvas className="flex-1 min-h-[300px]" nodeExecutions={executionResult?.nodeExecutions} />

                        {/* Simple Execution Status Bar */}
                        {executionResult && (
                            <div className={cn(
                                "border-t px-4 py-2 flex items-center justify-between text-sm shrink-0",
                                executionResult.status === 'completed' && "bg-green-50 dark:bg-green-950/20",
                                executionResult.status === 'error' && "bg-red-50 dark:bg-red-950/20",
                                executionResult.status === 'executing' && "bg-yellow-50 dark:bg-yellow-950/20"
                            )}>
                                <span className="font-medium">
                                    {executionResult.status === 'executing' && '⏳ Running test...'}
                                    {executionResult.status === 'completed' && '✅ Test completed successfully'}
                                    {executionResult.status === 'error' && `❌ Test failed: ${executionResult.error || 'Unknown error'}`}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setCurrentExecutionId(null)}
                                    className="h-6 px-2"
                                >
                                    <X className="w-3 h-3" />
                                </Button>
                            </div>
                        )}

                        {/* Execution History Panel */}
                        {showHistory && (
                            <div className="border-t bg-muted/10 max-h-[250px] overflow-auto">
                                <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between text-xs font-medium text-muted-foreground">
                                    <span>Execution History</span>
                                    <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => setShowHistory(false)}>
                                        <X className="w-3 h-3" />
                                    </Button>
                                </div>
                                <ExecutionLogTable executions={historyData?.executions || []} />
                            </div>
                        )}
                    </div>

                    {/* Right: Properties */}
                    {selectedNodeId && (
                        <PropertiesPane
                            nodeExecutions={executionResult?.nodeExecutions}
                            onTestNode={handleTestNode}
                            isTestingNode={isTestingNode}
                        />
                    )}
                </div>
            </div>
        </ReactFlowProvider>
    );
}
