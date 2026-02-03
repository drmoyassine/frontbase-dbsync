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

        const bounds = reactFlowWrapper.current.getBoundingClientRect();
        const position = reactFlowInstance.project({
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
        });

        const newNode = {
            id: `${nodeType}-${Date.now()}`,
            type: nodeType,
            position,
            data: {
                label: getNodeLabel(nodeType),
                type: nodeType,
                inputs: getDefaultInputs(nodeType),
                outputs: getDefaultOutputs(nodeType),
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

// Helper functions for default node configuration
function getNodeLabel(type: string): string {
    const labels: Record<string, string> = {
        // Triggers
        trigger: 'Manual Trigger',
        webhook_trigger: 'Webhook',
        schedule_trigger: 'Schedule',
        // Core
        action: 'Action',
        condition: 'Condition',
        // Actions
        http_request: 'HTTP Request',
        transform: 'Transform',
        log: 'Console Log',
        // Integrations
        database: 'Database Query',
        // Interface
        toast: 'Show Toast',
        redirect: 'Redirect',
        refresh: 'Refresh Page',
    };
    return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getDefaultInputs(type: string): Array<{ name: string; type: string; value?: any }> {
    switch (type) {
        case 'trigger':
            return [{ name: 'data', type: 'any' }];
        case 'http_request':
            return [
                { name: 'url', type: 'string', value: '' },
                { name: 'method', type: 'string', value: 'GET' },
                { name: 'headers', type: 'json', value: {} },
                { name: 'body', type: 'json', value: null },
            ];
        case 'condition':
            return [
                { name: 'condition', type: 'string', value: '' },
                { name: 'data', type: 'any' },
            ];
        case 'transform':
            return [
                { name: 'expression', type: 'string', value: '' },
                { name: 'data', type: 'any' },
            ];
        case 'toast':
            return [
                { name: 'message', type: 'string', value: 'Operation successful' },
                { name: 'type', type: 'string', value: 'success' }, // success, error, info
            ];
        case 'redirect':
            return [
                { name: 'url', type: 'string', value: '/' },
            ];
        case 'refresh':
            return [];
        case 'database':
            return [
                { name: 'query', type: 'string', value: 'SELECT * FROM users' },
            ];
        default:
            return [{ name: 'input', type: 'any' }];
    }
}

function getDefaultOutputs(type: string): Array<{ name: string; type: string }> {
    switch (type) {
        case 'condition':
            return [
                { name: 'true', type: 'any' },
                { name: 'false', type: 'any' },
            ];
        default:
            return [{ name: 'output', type: 'any' }];
    }
}

// Wrap with provider for external use
export function WorkflowCanvasWithProvider(props: WorkflowCanvasProps) {
    return (
        <ReactFlowProvider>
            <WorkflowCanvas {...props} />
        </ReactFlowProvider>
    );
}
