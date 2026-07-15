"""Per-operation response models (CF-22 P0 — GENERATED from router return key-sets).

Each model documents the literal keys an operation returns. Value types are
inferred only where every return site agrees on a constant type; everything
else is Optional[Any] (documenting the key without over-constraining the value).
Regenerate with the AST tool when a handler's return shape changes — the
response_model will then enforce the new shape.
"""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class AddTursoDatabaseResult(BaseModel):
    database: Optional[Any] = None
    success: bool


class BulkDeleteDraftsResult(BaseModel):
    deleted: Optional[Any] = None


class CancelMoveResult(BaseModel):
    cancelled: bool
    engine: Optional[Any] = None


class CheckSlugResult(BaseModel):
    available: Optional[Any] = None
    error: Optional[Any] = None


class CloudflareStatusResult(BaseModel):
    account_id: Optional[Any] = None
    deployed: bool
    url: Optional[Any] = None
    worker_name: Optional[Any] = None


class ConnectDenoResult(BaseModel):
    account_name: Optional[Any] = None
    auto_detected: Optional[Any] = None
    detail: Optional[Any] = None
    org_slug: Optional[Any] = None
    org_uuid: Optional[Any] = None
    success: bool
    user_id: Optional[Any] = None


class CreateCheckoutResult(BaseModel):
    url: Optional[Any] = None


class CreateInviteResult(BaseModel):
    invite: Optional[Any] = None
    link: Optional[Any] = None
    success: bool


class CreateNetlifySiteResult(BaseModel):
    id: Optional[Any] = None
    name: Optional[Any] = None
    url: Optional[Any] = None


class CreatePlanResult(BaseModel):
    plan: Optional[Any] = None


class CreatePortalResult(BaseModel):
    url: Optional[Any] = None


class CreateProjectResult(BaseModel):
    project: Optional[Any] = None


class CreateStorageProviderResult(BaseModel):
    account_name: Optional[Any] = None
    config: Optional[Any] = None
    created_at: Optional[Any] = None
    id: Optional[Any] = None
    is_active: bool
    name: Optional[Any] = None
    provider: Optional[Any] = None
    provider_account_id: Optional[Any] = None


class CreateTenantResult(BaseModel):
    tenant: Optional[Any] = None


class CreateTenantUserResult(BaseModel):
    user: Optional[Any] = None


class CreateVercelProjectResult(BaseModel):
    id: Optional[Any] = None
    name: Optional[Any] = None


class DeleteEdgeVectorResult(BaseModel):
    id: Optional[Any] = None
    message: Optional[Any] = None
    remote_deleted: Optional[Any] = None
    success: bool


class DeployToCloudflareResult(BaseModel):
    account_id: Optional[Any] = None
    engine_id: Optional[Any] = None
    success: bool
    url: Optional[Any] = None
    worker_name: Optional[Any] = None


class ExportEngineResult(BaseModel):
    bundle: Optional[Any] = None
    engine_id: Optional[Any] = None
    move_status: Optional[Any] = None


class FinalizeMoveResult(BaseModel):
    engine_id: Optional[Any] = None
    finalized: bool


class GetAgentCatalogueResult(BaseModel):
    coreTools: Optional[Any] = None
    mcpServers: Optional[Any] = None
    skills: Optional[Any] = None


class GetAgentConfigResult(BaseModel):
    default_provider: Optional[Any] = None
    enabled: Optional[Any] = None
    quota_exceeded_action: Optional[Any] = None


class GetAnalyticsResult(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    active_tenants: Optional[Any] = None
    avg_credits_per_tenant: Optional[Any] = None
    daily_series: Optional[Any] = None
    errors: Optional[Any] = None
    model_usage: Optional[Any] = None
    period: Optional[Any] = None
    provider_usage: Optional[Any] = None
    quota_exhausted: Optional[Any] = None
    top_tenants: Optional[Any] = None
    total_consumed: Optional[Any] = None


class GetCatalogResult(BaseModel):
    models_by_type: Optional[Any] = None
    provider: Optional[Any] = None
    total: Optional[Any] = None


class GetEngineLogsResult(BaseModel):
    cached: Optional[Any] = None
    logs: Optional[Any] = None
    next_cursor: Optional[Any] = None
    provider: Optional[Any] = None


class GetEngineSourceResult(BaseModel):
    file_count: Optional[Any] = None
    files: Optional[Any] = None
    success: bool
    total_size: Optional[Any] = None


class GetInternalCredsResult(BaseModel):
    supabaseKey: Optional[Any] = None
    supabaseServiceKey: Optional[Any] = None
    supabaseUrl: Optional[Any] = None


class GetLimitRegistryResult(BaseModel):
    limits: Optional[Any] = None


class GetLogRetentionResult(BaseModel):
    log_persistence: Optional[Any] = None
    plan_tier: Optional[Any] = None
    prerequisites_met: Optional[Any] = None
    provider: Optional[Any] = None
    retention_hours: Optional[Any] = None


class GetMyAddonsResult(BaseModel):
    addons: Optional[Any] = None


class GetMyPlanResult(BaseModel):
    limits: Optional[Any] = None
    plan: Optional[Any] = None
    usage: Optional[Any] = None


class GetMyTenantResult(BaseModel):
    message: Optional[Any] = None
    tenant: Optional[Any] = None


class GetProfileConfigsResult(BaseModel):
    profiles: Optional[Any] = None


class GetPromptResult(BaseModel):
    description: str
    messages: Optional[Any] = None
    name: str


class GetSchemasResult(BaseModel):
    providers: Optional[Any] = None
    schemas: Optional[Any] = None


class GetTenantResult(BaseModel):
    tenant: Optional[Any] = None


class GetWorkspaceAgentTokenResult(BaseModel):
    token: Optional[Any] = None


class GrantCreditsResult(BaseModel):
    balance: Optional[Any] = None


class GrantTenantAddonResult(BaseModel):
    addon: Optional[Any] = None


class HandleWebhookResult(BaseModel):
    status: str


class ImportEngineResult(BaseModel):
    confirm_secret: Optional[Any] = None
    engine_id: Optional[Any] = None
    summary: Optional[Any] = None


class InspectWorkerSecretsResult(BaseModel):
    secrets: Optional[Any] = None
    success: bool


class InspectWorkerSettingsResult(BaseModel):
    settings: Optional[Any] = None
    success: bool


class InstallSkillResult(BaseModel):
    installed: bool
    profileId: Optional[Any] = None
    skillId: Optional[Any] = None


class ListAgentProvidersResult(BaseModel):
    providers: Optional[Any] = None


class ListApiKeysResult(BaseModel):
    keys: Optional[Any] = None
    total: Optional[Any] = None


class ListBalancesResult(BaseModel):
    balances: Optional[Any] = None


class ListEnginesForProviderResult(BaseModel):
    detail: Optional[Any] = None
    engines: Optional[Any] = None
    success: bool


class ListInvitesResult(BaseModel):
    invites: Optional[Any] = None


class ListMcpServerToolsResult(BaseModel):
    tools: Optional[Any] = None
    total: Optional[Any] = None


class ListMcpServersResult(BaseModel):
    mcpServers: Optional[Any] = None
    total: Optional[Any] = None


class ListPlansResult(BaseModel):
    plans: Optional[Any] = None


class ListProfileSkillsResult(BaseModel):
    skills: Optional[Any] = None
    total: Optional[Any] = None


class ListProfilesResult(BaseModel):
    profiles: Optional[Any] = None
    total: Optional[Any] = None


class ListProjectDatasourcesResult(BaseModel):
    available: Optional[Any] = None
    granted: Optional[Any] = None


class ListProjectMembersResult(BaseModel):
    members: Optional[Any] = None


class ListProjectsResult(BaseModel):
    projects: Optional[Any] = None


class ListPromptsResult(BaseModel):
    prompts: Optional[Any] = None


class ListPublicPlansResult(BaseModel):
    detailed: Optional[Any] = None
    plans: Optional[Any] = None


class ListResourcesResult(BaseModel):
    resources: Optional[Any] = None


class ListSecurityEventsResult(BaseModel):
    events: Optional[Any] = None
    limit: Optional[Any] = None
    offset: Optional[Any] = None
    total: Optional[Any] = None


class ListSkillsResult(BaseModel):
    skills: Optional[Any] = None
    total: Optional[Any] = None


class ListTenantAddonsResult(BaseModel):
    addons: Optional[Any] = None


class ListTenantsResult(BaseModel):
    tenants: Optional[Any] = None


class ListToolsResult(BaseModel):
    tools: Optional[Any] = None


class McpRootResult(BaseModel):
    capabilities: Optional[Any] = None
    instructions: Optional[Any] = None
    name: Optional[Any] = None
    protocolVersion: str
    version: str


class MoveEngineToProjectEndpointResult(BaseModel):
    engine_id: Optional[Any] = None
    summary: Optional[Any] = None


class PublishDraftBatchResult(BaseModel):
    engineId: Optional[Any] = None
    error: Optional[Any] = None
    message: Optional[Any] = None
    name: Optional[Any] = None
    results: Optional[Any] = None
    success: Optional[Any] = None
    version: Optional[Any] = None


class RemoveTursoDatabaseResult(BaseModel):
    detail: str
    success: bool


class ResetAgentSettingsResult(BaseModel):
    deleted: Optional[Any] = None
    message: str
    scope: Optional[Any] = None


class ResetAllDailyResult(BaseModel):
    reset_count: Optional[Any] = None


class ResetTenantDailyResult(BaseModel):
    balance: Optional[Any] = None


class RevealApiKeyResult(BaseModel):
    key: Optional[Any] = None


class RotationHistoryResult(BaseModel):
    history: Optional[Any] = None


class SecurityEventsSummaryResult(BaseModel):
    by_severity: Optional[Any] = None
    total: Optional[Any] = None


class SetDefaultAgentProviderResult(BaseModel):
    provider: Optional[Any] = None


class SyncBillingAddonsResult(BaseModel):
    success: bool
    synced_addons: Optional[Any] = None


class SyncEngineLogsResult(BaseModel):
    detail: Optional[Any] = None
    synced: Optional[Any] = None


class TenantSecretsAuditLogsResult(BaseModel):
    engine_id: Optional[Any] = None
    filters: Optional[Any] = None
    is_shared: Optional[Any] = None
    logs: Optional[Any] = None


class TestMcpServerResult(BaseModel):
    reachable: Optional[Any] = None
    serverId: Optional[Any] = None


class TestTursoDatabaseResult(BaseModel):
    detail: Optional[Any] = None
    success: Optional[Any] = None


class ToggleDraftActiveResult(BaseModel):
    id: Optional[Any] = None
    is_active: Optional[Any] = None


class UpdateAgentConfigResult(BaseModel):
    config: Optional[Any] = None


class UpdateAgentSettingsResult(BaseModel):
    message: str
    scope: Optional[Any] = None


class UpdateEngineSourceResult(BaseModel):
    file_count: Optional[Any] = None
    files_saved: Optional[Any] = None
    is_forked: Optional[Any] = None
    modified_core_files: Optional[Any] = None
    success: bool


class UpdateLogConfigResult(BaseModel):
    log_persistence: Optional[Any] = None


class UpdateMyTenantResult(BaseModel):
    success: bool
    tenant: Optional[Any] = None


class UpdatePlanResult(BaseModel):
    plan: Optional[Any] = None


class UpdateProfileConfigResult(BaseModel):
    profile: Optional[Any] = None
    use_type: Optional[Any] = None


class UpdateProjectMetaResult(BaseModel):
    project: Optional[Any] = None


class UpdateTenantResult(BaseModel):
    success: bool
    tenant: Optional[Any] = None


class VectorSearchResult(BaseModel):
    results: Optional[Any] = None
    success: bool


class VectorUpsertResult(BaseModel):
    success: bool
    upserted: Optional[Any] = None

