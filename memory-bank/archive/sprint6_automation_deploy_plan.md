# Sprint 5: Automation Engine + Deploy

## Overview

Enhance the Dafthunk automation engine with new node types and scheduling, then enable one-click deployment to edge platforms (Cloudflare Workers, Vercel Edge, Supabase Functions).

**Estimated Effort:** 3-4 days

---

## Architecture

```mermaid
┌─────────────────────────────────────────────────────────────────────┐
│                     DEPLOYMENT FLOW                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Builder UI ──► FastAPI ──► Build Bundle ──► Deploy to Edge         │
│       │            │              │               │                  │
│       ▼            ▼              ▼               ▼                  │
│  Click Deploy   Package      Wrangler/      Edge Runtime             │
│  Button         Workflow     Vercel CLI     (Workers/Vercel)         │
│                     │                                                │
│                     ▼                                                │
│              Inject Secrets                                          │
│              & Env Vars                                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Automation Engine Enhancement

### New Node Types

#### Workflow Nodes (Server-Side)

| Node Type     | Purpose                              |
|---------------|--------------------------------------|
| HTTP Request  | Make external API calls              |
| Transform     | Map/filter/transform data            |
| Condition     | Branch based on logic                |
| Set Variable  | Store values in execution context    |
| Delay         | Wait for specified duration          |
| Loop          | Iterate over arrays                  |

#### UI Action Nodes (Client-Side)

| Action Type           | Purpose                                      | Scope         |
|-----------------------|----------------------------------------------|---------------|
| Set Page Variable     | Store temporary UI state (cleared on refresh)| Client        |
| Set Session Variable  | Store user preferences (cleared on logout)   | Client + localStorage |
| Set Cookie            | Store persistent data (survives sessions)    | Client + Server |
| Run Custom JS         | Execute user-defined JavaScript function     | Client        |
| Update Active User    | Modify current user's profile data in DB     | Server (API)  |
| Copy to Clipboard     | Copy text/value to user's clipboard          | Client        |
| Show Notification     | Display toast/alert message                  | Client        |
| Navigate              | Redirect to another page/URL                 | Client        |
| Open Modal            | Open a modal dialog by ID                    | Client        |
| Close Modal           | Close active modal                           | Client        |
| Submit Form           | Programmatically submit a form               | Client        |
| Refresh Data          | Re-fetch data for a component                | Client        |
| *TBD*                 | *Additional actions to be identified later*  | -             |

#### Action Configuration Examples

```typescript
// Set Page Variable action
interface SetPageVariableAction {
  type: 'set_page_variable';
  config: {
    variableName: string;
    value: string | number | boolean | object;
    // Value can include expressions: "{{form.name}}" or "{{query.result}}"
  };
}

// Run Custom JS action
interface RunCustomJSAction {
  type: 'run_custom_js';
  config: {
    code: string;  // User-defined JS code
    // Available context: { page, session, cookies, event, data }
  };
}

// Update Active User action
interface UpdateActiveUserAction {
  type: 'update_active_user';
  config: {
    fields: Record<string, unknown>;  // { name: "{{form.name}}" }
    // Calls PATCH /api/users/me endpoint
  };
}

// Copy to Clipboard action
interface CopyToClipboardAction {
  type: 'copy_to_clipboard';
  config: {
    value: string;  // Text to copy, supports expressions
    showNotification?: boolean;
  };
}
```

### Workflow Scheduling

```typescript
// Cron trigger configuration
interface CronTrigger {
  type: 'cron';
  schedule: string;  // "0 9 * * *" = every day at 9am
  timezone?: string; // "America/New_York"
}

// Implementation using Upstash QStash for serverless cron
import { Client } from '@upstash/qstash';

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export async function scheduleWorkflow(
  workflowId: string, 
  schedule: string
): Promise<void> {
  await qstash.schedules.create({
    destination: `${process.env.EDGE_URL}/execute/${workflowId}`,
    cron: schedule,
  });
}
```

### Workflow Versioning

- Store version history in database
- Allow rollback to previous versions
- Show diff between versions in UI

---

## Part 2: Edge Deployment

### Deployment Targets

| Platform            | Runtime       | Config File      |
|---------------------|---------------|------------------|
| Cloudflare Workers  | V8 Isolates   | `wrangler.toml`  |
| Vercel Edge         | V8 Isolates   | `vercel.json`    |
| Supabase Functions  | Deno          | `config.toml`    |

### Cloudflare Workers Setup

```toml
# wrangler.toml
name = "frontbase-edge"
main = "dist/index.js"
compatibility_date = "2024-01-01"

[vars]
SUPABASE_URL = "..."

[[kv_namespaces]]
binding = "CACHE"
id = "..."
```

### One-Click Deploy Flow

1. **Package**: Bundle current Hono app with esbuild
2. **Configure**: Generate platform-specific config
3. **Secrets**: Inject environment variables via API
4. **Deploy**: Use platform CLI (wrangler/vercel)
5. **Verify**: Hit health endpoint to confirm deployment

### Deployment API

```typescript
// POST /api/deployments
interface DeployRequest {
  target: 'cloudflare' | 'vercel' | 'supabase';
  projectId: string;
}

// Response includes deployment URL and status
interface DeployResponse {
  id: string;
  status: 'pending' | 'building' | 'deployed' | 'failed';
  url?: string;
  logs: string[];
}
```

---

## Implementation Phases

### Phase 1: Automation Nodes (4 hours)

- [ ] Implement HTTP Request node
- [ ] Implement Transform node (JSONPath, map/filter)
- [ ] Implement Condition node (if/else branching)
- [ ] Add nodes to workflow editor palette

### Phase 2: Scheduling (3 hours)

- [ ] Integrate Upstash QStash for cron
- [ ] Add schedule UI to workflow editor
- [ ] Store schedules in database
- [ ] List active schedules in dashboard

### Phase 3: Versioning (2 hours)

- [ ] Add version column to workflows table
- [ ] Save version on publish
- [ ] Add "View History" UI
- [ ] Implement rollback functionality

### Phase 4: Deployment Scripts (4 hours)

- [ ] Create `scripts/deploy-cloudflare.ts`
- [ ] Create `scripts/deploy-vercel.ts`
- [ ] Add secrets injection via platform APIs
- [ ] Test deployments end-to-end

### Phase 5: Deployment UI (3 hours)

- [ ] Add "Deploy" button to Builder
- [ ] Create deployment status modal
- [ ] Show deployment logs in real-time
- [ ] Store deployment history

---

## Environment Variables

| Variable            | Required | Description                    |
|---------------------|----------|--------------------------------|
| `QSTASH_TOKEN`      | Yes      | Upstash QStash for cron        |
| `CF_API_TOKEN`      | No       | Cloudflare API token           |
| `CF_ACCOUNT_ID`     | No       | Cloudflare account ID          |
| `VERCEL_TOKEN`      | No       | Vercel deployment token        |

---

## Acceptance Criteria

- [ ] New automation nodes available in editor
- [ ] Workflows can be scheduled with cron
- [ ] One-click deploy to Cloudflare Workers works
- [ ] Deployment status visible in Builder
- [ ] Secrets securely managed per deployment
- [ ] Version history accessible and rollback works

---

## Testing Plan

1. Create workflow with HTTP Request node, verify external call
2. Schedule workflow with cron, verify it runs on schedule
3. Deploy to Cloudflare Workers test account
4. Verify deployed workflow responds at edge URL
5. Test rollback to previous workflow version
