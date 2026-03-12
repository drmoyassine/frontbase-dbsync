# Deno Deploy API v2 Reference

Base URL: `https://api.deno.com/v2`  
Auth: `Authorization: Bearer <access_token>`

---

## GET `/v2/apps/{app}`
**Get app details**

Get detailed information about an app, including labels, layers, environment variables, and config.

**Response 200:** OK

---

## PATCH `/v2/apps/{app}`
**Update app**

All fields are optional. `labels` and `layers` replace the entire value. `env_vars` performs a deep merge with existing variables. `config` replaces the entire deploy config (no deep merge).

Updating `layers` or `env_vars` will restart running isolates.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | No | New app slug |
| `labels` | Labels | No | Replace all labels |
| `layers` | array | No | Replace all layer references |
| `env_vars` | array | No | Deep merge with existing environment variables |
| `config` | Config | No | Replace the entire deploy config |

**Response 200:** OK

---

## DELETE `/v2/apps/{app}`
**Delete app**

Delete an app and all its revisions.

**Response 204:** OK

---

## GET `/v2/apps`
**List apps**

List apps with optional filtering by labels or layer.

Use `labels[key]=value` query parameters to filter by label values. Use `layer` to filter apps that reference a specific layer.

**Response 200:** OK

---

## POST `/v2/apps`
**Create app**

Apps can reference layers for shared configuration, have app-specific environment variables, and a config that provides defaults for revisions.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | No | App slug. If omitted, a random slug is generated |
| `labels` | Labels | No | Key-value labels for filtering and grouping (max 5) |
| `layers` | array | No | Layers to reference for inherited configuration |
| `env_vars` | array | No | App-specific environment variables |
| `config` | Config | No | Default build and runtime configuration |

**Response 200:** OK

---

## POST `/v2/apps/{app}/deploy`
**Create revision**

Create a new revision (deployment).

Upload source files as assets and optionally specify `config`, `layers`, `env_vars`, and `labels`. Asset keys are relative paths resolved against `/app/src`.

If `config` is omitted, it is inherited from the app's config. If specified, it fully replaces the app's

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `assets` | object | Yes | Source files to deploy. Keys are paths relative to `/app/src` |
| `config` | Config | No | Build and runtime config. If omitted, inherited from the app |
| `layers` | array | No | Layers to reference for this revision |
| `env_vars` | array | No | Revision-specific environment variables (immutable once created) |
| `labels` | Labels | No | Metadata labels (e.g. git branch, commit SHA) |
| `production` | boolean | No | Whether to deploy to the production timeline. Defaults to true |
| `preview` | boolean | No | Whether to deploy as a preview deployment. Defaults to false |

**Response 202:** OK

---

## GET `/v2/apps/{app}/logs`
**Get logs**

Query historical runtime logs.

Use `stream=true` to stream runtime logs in real-time using Server-Sent Events or JSONL.

When streaming, event types include: `log` (a log entry), `heartbeat` (keep-alive sent every 30 seconds), and `error` (stream error).

**Response 200:** OK

---

## GET `/v2/revisions/{revision}`
**Get revision details**

Get revision details.

Revision IDs are globally unique. The response includes `layers`, `env_vars`, and `config` when available.

Status lifecycle (one of):
- queued -> building -> succeeded (success)
- queued -> failed (build error, cancelled, or timeout)
- queued -> skipped (e.g., commit message 

**Response 200:** OK

---

## POST `/v2/revisions/{revision}/cancel`
**Cancel revision build**

Request cancellation of a build in progress. Cancellation is asynchronous â€” this endpoint returns immediately with the current revision state. The `cancellation_requested_at` field will be set, but the revision may still be in `building` status. Poll the revision or use the [/progress](#tag/revisi

**Response 200:** OK

---

## GET `/v2/apps/{app}/revisions`
**List revisions for app**

List revisions for an app. Optionally filter by status.

**Response 200:** OK

---

## GET `/v2/revisions/{revision}/progress`
**Stream revision progress**

Stream revision build progress. The stream ends when the revision
reaches a terminal state (`succeeded`, `failed`, or `skipped`).

Supports both JSONL (`Accept: application/x-ndjson`) and SSE (`Accept: text/event-stream`)
formats via the `Accept` header.

**Response 200:** OK

---

## GET `/v2/revisions/{revision}/build_logs`
**Stream build logs**

Stream build logs for a revision.

Supports both Server-Sent Events (SSE) (`Accept: text/event-stream`) and JSON Lines (`Accept: application/x-ndjson`) formats. Use the `Accept` header to specify the desired format.

The stream remains open during active builds and closes when the build completes.

**Response 200:** OK

---

## GET `/v2/revisions/{revision}/timelines`
**Get revision timelines**

Get the timelines (deployment targets) where this revision is active.

**Response 200:** OK

---

## POST `/v2/layers`
**Create layer**

Create a new layer.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | Yes | Human-readable layer slug |
| `description` | string | No | Optional description of the layer's purpose |
| `layers` | array | No | Other layers to include for hierarchical configuration |
| `env_vars` | array | No | Environment variables for this layer |

**Response 201:** OK

---

## GET `/v2/layers`
**List layers**

List all layers in the organization.

**Response 200:** OK

---

## GET `/v2/layers/{layer}`
**Get layer**

Get a layer by ID or slug.

Slugs cannot contain underscores; IDs always do.

**Response 200:** OK

---

## PATCH `/v2/layers/{layer}`
**Update layer**

Update a layer. This is the key operation for bulk environment variable updates.

All fields are optional. `env_vars` performs a deep merge with existing variables: update by ID, update by key+contexts match, or create new. Set `delete: true` to remove a variable.

Running isolates will restart to p

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | No | New layer slug |
| `description` | string | No | New description |
| `layers` | array | No | Replace all included layers |
| `env_vars` | array | No | Deep merge with existing environment variables |

**Response 200:** OK

---

## DELETE `/v2/layers/{layer}`
**Delete layer**

Returns 409 Conflict if apps still reference this layer.

**Response 204:** OK

---

## GET `/v2/layers/{layer}/apps`
**List apps using layer**

List apps that reference this layer.

The `layer_position` indicates the index in each app's `layers` array.

**Response 200:** OK

---

## Key Schemas

### EnvVarInput

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | The environment variable name |
| `value` | string | Yes | The environment variable value |
| `secret` | boolean | No | Whether to mask the value in API responses. Defaults to false |
| `contexts` | object | No | Deployment contexts this variable applies to. Defaults to `"all"`. |

### EnvVarInputForDeploy

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | The environment variable name |
| `value` | string | Yes | The environment variable value |

### Runtime

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | object | Yes | `dynamic` runs a Deno process; `static` serves pre-built files |
| `entrypoint` | string | No | Main module path. Required when `type` is `dynamic` |
| `args` | array | No | Additional CLI arguments passed to the entrypoint |
| `cwd` | string | No | Working directory or static file root. Required when `type` is `static` |
| `spa` | boolean | No | Enable single-page application mode (fallback to index.html). Only for `static` type |

### Config

| Field | Type | Required | Description |
|---|---|---|---|
| `framework` | object | No | Framework preset. Mutually exclusive with `runtime` |
| `install` | object | No | Custom install command. Omit to skip the install step |
| `build` | object | No | Custom build command. Omit to skip the build step |
| `predeploy` | object | No | Command to run before each deployment (e.g. database migrations). Omit to skip |
| `runtime` | Runtime | No | Runtime configuration. Mutually exclusive with `framework` |

### App

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique app identifier (UUID) |
| `slug` | string | Yes | Human-readable app slug |
| `labels` | Labels | No | User-defined key-value labels for filtering and grouping |
| `layers` | array | Yes | Layers referenced by this app, in priority order (later overrides earlier) |
| `env_vars` | array | No | App-specific environment variables |
| `config` | ConfigOutput | No | Default build and runtime configuration for new revisions |
| `updated_at` | string | Yes | ISO 8601 timestamp of last modification |
| `created_at` | string | Yes | ISO 8601 timestamp of creation |

### Revision

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique revision identifier |
| `status` | object | Yes | Current revision lifecycle status |
| `failure_reason` | object | Yes | Reason for failure, or null if not failed |
| `labels` | Labels | No | Metadata labels attached to this revision (e.g. git info) |
| `layers` | array | Yes | Layers referenced by this revision, in priority order (later overrides earlier) |
| `env_vars` | array | Yes | Revision-specific environment variables (immutable once created) |
| `config` | ConfigOutput | No | Build and runtime configuration used for this revision |
| `created_at` | string | Yes | ISO 8601 timestamp of creation |
| `cancellation_requested_at` | object | Yes | ISO 8601 timestamp when cancellation was requested, or null |
| `build_finished_at` | object | Yes | ISO 8601 timestamp when the build completed, or null if still building |
| `deleted_at` | object | Yes | ISO 8601 timestamp of deletion, or null if active |
