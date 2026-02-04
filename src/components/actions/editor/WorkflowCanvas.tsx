/**
 * WorkflowCanvas - Main React Flow Editor
 * 
 * The visual workflow builder canvas using React Flow.
 */

import React, { useCallback, useRef } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    ReactFlowProvider,
    ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useActionsStore } from '@/stores/actions';
import { TriggerNode } from '../nodes/TriggerNode';
import { ActionNode } from '../nodes/ActionNode';
import { ConditionNode } from '../nodes/ConditionNode';
import { cn } from '@/lib/utils';
import {
    getNodeSchema,
    getDefaultInputsFromSchema,
    getDefaultOutputsFromSchema
} from '@/lib/workflow/nodeSchemas';

// Register custom node types
const nodeTypes = {
    // Triggers - all trigger variants use TriggerNode
    trigger: TriggerNode,
    webhook_trigger: TriggerNode,
    schedule_trigger: TriggerNode,
    // Core actions
    action: ActionNode,
    condition: ConditionNode,
    // Map specific action types to the generic ActionNode
    http_request: ActionNode,
    transform: ActionNode,
    log: ActionNode,
    database: ActionNode,
    data_request: ActionNode,
    // Interface Actions
    toast: ActionNode,
    redirect: ActionNode,
    refresh: ActionNode,
};

interface WorkflowCanvasProps {
    className?: string;
}

export function WorkflowCanvas({ className }: WorkflowCanvasProps) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance | null>(null);

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        selectNode,
        addNode,
    } = useActionsStore();

    const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
        selectNode(node.id);
    }, [selectNode]);

    const onPaneClick = useCallback(() => {
        selectNode(null);
    }, [selectNode]);

    // Handle drag and drop from palette
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();

        if (!reactFlowInstance || !reactFlowWrapper.current) return;

        const nodeType = event.dataTransfer.getData('application/reactflow');
        if (!nodeType) return;

        const position = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        // Get label from schema or fallback to formatted type
        const schema = getNodeSchema(nodeType);
        const label = schema?.label || nodeType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        const newNode = {
            id: `${nodeType}-${Date.now()}`,
            type: nodeType,
            position,
            data: {
                label,
                type: nodeType,
                inputs: getDefaultInputsFromSchema(nodeType),
                outputs: getDefaultOutputsFromSchema(nodeType),
            },
        };

        addNode(newNode);
    }, [reactFlowInstance, addNode]);

    return (
        <div ref={reactFlowWrapper} className={cn('h-full w-full', className)}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onInit={setReactFlowInstance}
                onDragOver={onDragOver}
                onDrop={onDrop}
                nodeTypes={nodeTypes}
                fitView
                snapToGrid
                snapGrid={[15, 15]}
                className="bg-muted/30"
            >
                <Background gap={15} size={1} />
                <Controls />
                <MiniMap
                    nodeStrokeWidth={3}
                    zoomable
                    pannable
                    className="bg-background border rounded-md"
                />
            </ReactFlow>
        </div>
    );
}

// Wrap with provider for external use
export function WorkflowCanvasWithProvider(props: WorkflowCanvasProps) {
    return (
        <ReactFlowProvider>
            <WorkflowCanvas {...props} />
        </ReactFlowProvider>
    );
}

