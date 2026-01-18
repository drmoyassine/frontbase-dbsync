export interface ColumnSchema {
    name: string
    type: string
    nullable: boolean
    primary_key: boolean
}

export interface TableSchema {
    columns: ColumnSchema[]
}

export interface Datasource {
    id: string
    name: string
    type: 'supabase' | 'postgres' | 'wordpress' | 'wordpress_rest' | 'wordpress_graphql' | 'neon' | 'mysql'
    host: string
    port: number
    database: string
    username?: string
    api_url?: string
    table_prefix: string
    is_active: boolean
    last_tested_at?: string
    last_test_success?: boolean
    views?: DatasourceView[]
    created_at: string
    updated_at: string
}

export interface FieldMapping {
    id: string
    sync_config_id: string
    master_column: string
    slave_column: string
    transform?: string
    is_key_field: boolean
    skip_sync: boolean
}

export interface SyncConfig {
    id: string
    name: string
    description?: string
    master_datasource_id: string
    slave_datasource_id: string
    master_table: string
    slave_table: string
    master_pk_column: string
    slave_pk_column: string
    conflict_strategy: 'source_wins' | 'target_wins' | 'manual' | 'merge' | 'webhook'
    webhook_url?: string
    sync_deletes: boolean
    batch_size: number
    cron_schedule?: string
    is_active: boolean
    created_at: string
    updated_at: string
    last_sync_at?: string
    field_mappings: FieldMapping[]
    master_view?: DatasourceView
    slave_view?: DatasourceView
}

export interface SyncJob {
    id: string
    sync_config_id: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    total_records: number
    processed_records: number
    inserted_records: number
    updated_records: number
    deleted_records: number
    conflict_count: number
    error_count: number
    progress_percent: number
    error_message?: string
    started_at?: string
    completed_at?: string
    duration_seconds?: number
    created_at: string
    triggered_by: string
}

export interface DatasourceView {
    id: string
    name: string
    description?: string
    datasource_id: string
    target_table: string
    filters: any[]
    field_mappings?: Record<string, string>
    linked_views?: Record<string, any>
    visible_columns?: string[]
    pinned_columns?: string[]
    column_order?: string[]
    webhooks?: any[]
    created_at: string
    updated_at: string
}

export interface Conflict {
    id: string
    sync_config_id: string
    job_id: string
    record_key: string
    master_data: Record<string, unknown>
    slave_data: Record<string, unknown>
    conflicting_fields: string[]
    status: 'pending' | 'resolved_master' | 'resolved_slave' | 'resolved_merged' | 'skipped'
    resolved_data?: Record<string, unknown>
    resolved_by?: string
    resolved_at?: string
    resolution_notes?: string
    created_at: string
}

export interface RedisSettings {
    redis_url: string | null
    redis_token: string | null  // Upstash REST API token
    redis_enabled: boolean
    cache_ttl_data: number
    cache_ttl_count: number
}

export interface RedisTestResult {
    success: boolean
    message: string
}

export interface PrivacySettings {
    enableVisitorTracking: boolean
    cookieExpiryDays: number
    requireCookieConsent: boolean
}
