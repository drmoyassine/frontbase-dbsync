# Execution Pipeline Diagram — Implementation Plan

## Goal
Replace the vertical node list in `ExecutionDetail` with a horizontal pipeline diagram:
`🟢 Webhook Trigger → 🟢 HTTP Response → ...`

Hovering a node shows a tooltip with: **inputs, outputs, status, duration**.

## Proposed Changes

### 1. Edge Runtime — Enrich NodeExecution data

#### [MODIFY] `services/edge/src/engine/runtime.ts`

Add to `NodeExecution` interface:
```typescript
inputs?: Record<string, any>;
startedAt?: string;   // ISO
endedAt?: string;     // ISO
nodeName?: string;    // human-readable label
```

In `executeWorkflow()` + `executeSingleNode()`, around each `executeNode()` call:
- Set `nodeName` from node definition (`node.data?.label || node.name || node.id`)
- Set `inputs` = resolved inputs object
- Set `startedAt` = `new Date().toISOString()` before call
- Set `endedAt` = `new Date().toISOString()` after call

#### [MODIFY] `services/edge/src/schemas/workflow.ts`

Add optional fields to `NodeExecutionSchema`:
```typescript
inputs: z.record(z.any()).optional(),
startedAt: z.string().optional(),
endedAt: z.string().optional(),
nodeName: z.string().optional(),
```

### 2. Edge API — Include workflow graph in detail response

#### [MODIFY] `services/edge/src/routes/executions.ts`

In the `GET /:id` handler:
- After fetching the execution, also fetch the workflow via `stateProvider.getWorkflowById(execution.workflowId)`
- Include `workflowNodes` and `workflowEdges` (parsed JSON) in the response
- This gives the frontend the graph structure needed to order the pipeline

### 3. Frontend — Types & Hook

#### [MODIFY] `src/stores/actions/useActionsQuery.ts`

Extend `ExecutionLog` type:
```typescript
workflowNodes?: Array<{ id: string; name?: string; type: string }>;
workflowEdges?: Array<{ source: string; target: string }>;
```

Update `NodeExecution` sub-type to include `inputs`, `startedAt`, `endedAt`, `nodeName`.

### 4. Frontend — Pipeline Diagram Component

#### [MODIFY] `src/components/actions/ExecutionLogTable.tsx`

Replace the vertical node list in `ExecutionDetail` with a new `ExecutionPipeline` inline component:
- Topological sort using `workflowEdges` → linear order
- Render horizontal flexbox: colored pills connected by `→` arrows
- Each pill: status icon + node name (from `nodeName` or fallback to short `nodeId`)
- Wrap on overflow (for long pipelines)

#### Hover tooltip (using shadcn `HoverCard` or `Tooltip`):
| Field | Source |
|-------|--------|
| **Status** | `node.status` |
| **Duration** | `node.endedAt - node.startedAt` (computed) |
| **Inputs** | `node.inputs` (JSON, collapsible) |
| **Outputs** | `node.outputs` (JSON, collapsible) |
| **Error** | `node.error` (if present, red) |

## Backward Compatibility

- Old executions lack `inputs`, `startedAt`, `endedAt`, `nodeName` → tooltip shows "—" for missing fields
- Old executions lack `workflowNodes`/`workflowEdges` → fall back to `nodeExecutions` array order (as-is)

## Phase 2 (Backlog)

- **Branching visualization** — Render multi-branch/parallel-path workflows as a DAG instead of linear pipeline. Detect condition/parallel nodes from workflow edges and display branching paths visually.
