/**
 * Actions API Hooks - React Query
 * 
 * Handles server state for workflow drafts and executions.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types matching the Pydantic schemas
export interface WorkflowNode {
    id: string;
    name: string;
    type: string;
    position: { x: number; y: number };
    inputs: Array<{ name: string; type: string; value?: any; description?: string; required?: boolean }>;
    outputs: Array<{ name: string; type: string }>;
}

export interface WorkflowEdge {
    source: string;
    target: string;
    sourceOutput: string;
    targetInput: string;
}

export interface WorkflowDraft {
    id: string;
    name: string;
    description?: string;
    trigger_type: 'manual' | 'http_webhook' | 'scheduled' | 'data_change';
    trigger_config?: Record<string, any>;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    is_published: boolean;
    published_version?: number;
    created_at: string;
    updated_at: string;
    created_by?: string;
}

export interface CreateDraftInput {
    name: string;
    description?: string;
    trigger_type?: 'manual' | 'http_webhook' | 'scheduled' | 'data_change';
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
}

export interface UpdateDraftInput {
    name?: string;
    description?: string;
    trigger_type?: 'manual' | 'http_webhook' | 'scheduled' | 'data_change';
    trigger_config?: Record<string, any>;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
}

const API_BASE = '/api/actions';

// ============ API Functions ============

async function fetchDrafts(): Promise<{ drafts: WorkflowDraft[]; total: number }> {
    const response = await fetch(`${API_BASE}/drafts`);
    if (!response.ok) throw new Error('Failed to fetch drafts');
    return response.json();
}

async function fetchDraft(id: string): Promise<WorkflowDraft> {
    const response = await fetch(`${API_BASE}/drafts/${id}`);
    if (!response.ok) throw new Error('Failed to fetch draft');
    return response.json();
}

async function createDraft(input: CreateDraftInput): Promise<WorkflowDraft> {
    const response = await fetch(`${API_BASE}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error('Failed to create draft');
    return response.json();
}

async function updateDraft(id: string, input: UpdateDraftInput): Promise<WorkflowDraft> {
    const response = await fetch(`${API_BASE}/drafts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error('Failed to update draft');
    return response.json();
}

async function deleteDraft(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/drafts/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete draft');
}

async function publishDraft(id: string): Promise<{ success: boolean; workflow_id: string; version: number }> {
    const response = await fetch(`${API_BASE}/drafts/${id}/publish`, {
        method: 'POST',
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to publish');
    }
    return response.json();
}

async function testDraft(id: string, parameters?: Record<string, any>): Promise<{ execution_id: string; status: string }> {
    const response = await fetch(`${API_BASE}/drafts/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to test');
    }
    return response.json();
}

// ============ React Query Hooks ============

export function useWorkflowDrafts() {
    return useQuery({
        queryKey: ['workflow-drafts'],
        queryFn: fetchDrafts,
        staleTime: 30000,
    });
}

export function useWorkflowDraft(id: string | null) {
    return useQuery({
        queryKey: ['workflow-draft', id],
        queryFn: () => fetchDraft(id!),
        enabled: !!id,
        staleTime: 10000,
    });
}

export function useCreateDraft() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createDraft,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
        },
    });
}

export function useUpdateDraft() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, ...input }: UpdateDraftInput & { id: string }) =>
            updateDraft(id, input),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
            queryClient.setQueryData(['workflow-draft', data.id], data);
        },
    });
}

export function useDeleteDraft() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteDraft,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
        },
    });
}

export function usePublishDraft() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: publishDraft,
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: ['workflow-drafts'] });
            queryClient.invalidateQueries({ queryKey: ['workflow-draft', id] });
        },
    });
}

export function useTestDraft() {
    return useMutation({
        mutationFn: ({ id, parameters }: { id: string; parameters?: Record<string, any> }) =>
            testDraft(id, parameters),
    });
}
