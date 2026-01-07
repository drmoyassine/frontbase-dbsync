/**
 * Actions Store - Zustand
 * 
 * Manages UI state for the workflow editor (synchronous operations).
 */

import { create } from 'zustand';
import { Node, Edge, Connection, addEdge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange } from 'reactflow';

export interface WorkflowNode extends Node {
    data: {
        label: string;
        type: string;
        inputs: Array<{ name: string; type: string; value?: any }>;
        outputs: Array<{ name: string; type: string }>;
    };
}

export interface ActionsState {
    // Current draft info
    currentDraftId: string | null;
    draftName: string;
    triggerType: 'manual' | 'http_webhook' | 'scheduled' | 'data_change';

    // React Flow state
    nodes: WorkflowNode[];
    edges: Edge[];
    selectedNodeId: string | null;

    // Editor state
    isEditorOpen: boolean;
    isDirty: boolean;
    isSaving: boolean;
    isPublishing: boolean;

    // Actions
    setCurrentDraft: (id: string | null, name?: string) => void;
    setTriggerType: (type: ActionsState['triggerType']) => void;

    // Node operations
    setNodes: (nodes: WorkflowNode[]) => void;
    addNode: (node: WorkflowNode) => void;
    updateNode: (id: string, data: Partial<WorkflowNode['data']>) => void;
    removeNode: (id: string) => void;
    onNodesChange: (changes: NodeChange[]) => void;

    // Edge operations
    setEdges: (edges: Edge[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;

    // Selection
    selectNode: (id: string | null) => void;

    // Editor controls
    openEditor: (draftId?: string) => void;
    closeEditor: () => void;
    markDirty: () => void;
    markClean: () => void;

    // Reset
    resetEditor: () => void;
}

const initialState = {
    currentDraftId: null,
    draftName: 'Untitled Workflow',
    triggerType: 'manual' as const,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    isEditorOpen: false,
    isDirty: false,
    isSaving: false,
    isPublishing: false,
};

export const useActionsStore = create<ActionsState>((set, get) => ({
    ...initialState,

    setCurrentDraft: (id, name) => set({
        currentDraftId: id,
        draftName: name || 'Untitled Workflow',
        isDirty: false
    }),

    setTriggerType: (type) => set({ triggerType: type, isDirty: true }),

    // Node operations
    setNodes: (nodes) => set({ nodes }),

    addNode: (node) => set((state) => ({
        nodes: [...state.nodes, node],
        isDirty: true
    })),

    updateNode: (id, data) => set((state) => ({
        nodes: state.nodes.map(n =>
            n.id === id ? { ...n, data: { ...n.data, ...data } } : n
        ),
        isDirty: true
    })),

    removeNode: (id) => set((state) => ({
        nodes: state.nodes.filter(n => n.id !== id),
        edges: state.edges.filter(e => e.source !== id && e.target !== id),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        isDirty: true
    })),

    onNodesChange: (changes) => set((state) => ({
        nodes: applyNodeChanges(changes, state.nodes) as WorkflowNode[],
        isDirty: true
    })),

    // Edge operations
    setEdges: (edges) => set({ edges }),

    onEdgesChange: (changes) => set((state) => ({
        edges: applyEdgeChanges(changes, state.edges),
        isDirty: true
    })),

    onConnect: (connection) => set((state) => ({
        edges: addEdge({ ...connection, animated: true }, state.edges),
        isDirty: true
    })),

    // Selection
    selectNode: (id) => set({ selectedNodeId: id }),

    // Editor controls
    openEditor: (draftId) => set({
        isEditorOpen: true,
        currentDraftId: draftId || null
    }),

    closeEditor: () => set({ isEditorOpen: false }),

    markDirty: () => set({ isDirty: true }),
    markClean: () => set({ isDirty: false }),

    // Reset
    resetEditor: () => set(initialState),
}));
