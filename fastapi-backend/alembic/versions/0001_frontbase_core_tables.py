"""Frontbase Core Tables Migration

Revision ID: 0001_frontbase_core
Revises: c5311426ba79
Create Date: 2026-01-09

This migration consolidates all Frontbase core tables from unified_schema.sql
into Alembic for a single migration system.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0001_frontbase_core'
down_revision: Union[str, Sequence[str], None] = 'c5311426ba79'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(conn, table_name: str) -> bool:
    """Check if a table exists in SQLite."""
    result = conn.execute(sa.text(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    ))
    return result.fetchone() is not None


def upgrade() -> None:
    """Create all Frontbase core tables if they don't exist."""
    conn = op.get_bind()
    
    # ============================
    # FRONTBASE TABLES
    # ============================
    
    # Project table
    if not table_exists(conn, 'project'):
        op.execute("""
            CREATE TABLE project (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                supabase_url TEXT,
                supabase_anon_key TEXT,
                supabase_service_key_encrypted TEXT,
                users_config TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        # Insert default project
        op.execute("""
            INSERT INTO project (id, name, description, created_at, updated_at) 
            VALUES ('default', 'My Frontbase Project', 'A new project created with Frontbase', datetime('now'), datetime('now'))
        """)
    
    # Pages table
    if not table_exists(conn, 'pages'):
        op.execute("""
            CREATE TABLE pages (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                title TEXT,
                description TEXT,
                keywords TEXT,
                is_public BOOLEAN DEFAULT true,
                is_homepage BOOLEAN DEFAULT false,
                layout_data TEXT NOT NULL,
                seo_data TEXT,
                deleted_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        # Insert default homepage
        op.execute("""
            INSERT INTO pages (id, name, slug, title, description, keywords, is_public, is_homepage, layout_data, seo_data, created_at, updated_at)
            VALUES (
                'default-homepage',
                'Home',
                'home',
                'Welcome to Frontbase',
                'Build amazing websites with our visual page builder',
                'frontbase, website builder, visual editor',
                true,
                true,
                '{"content":[{"id":"heading-1","type":"Heading","props":{"text":"Welcome to Frontbase","level":"1"},"children":[]},{"id":"text-1","type":"Text","props":{"text":"Start building your amazing website with our visual page builder.","size":"lg"},"children":[]},{"id":"button-1","type":"Button","props":{"text":"Get Started","variant":"default","size":"lg"},"children":[]}],"root":{}}',
                '{"openGraph":{"title":"Welcome to Frontbase","description":"Build amazing websites"},"twitter":{"card":"summary_large_image","title":"Welcome to Frontbase"}}',
                datetime('now'),
                datetime('now')
            )
        """)
    
    # App variables table
    if not table_exists(conn, 'app_variables'):
        op.execute("""
            CREATE TABLE app_variables (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                type TEXT CHECK(type IN ('variable', 'calculated')) NOT NULL,
                value TEXT,
                formula TEXT,
                description TEXT,
                created_at TEXT NOT NULL
            )
        """)
    
    # Assets table
    if not table_exists(conn, 'assets'):
        op.execute("""
            CREATE TABLE assets (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
    
    # Users table
    if not table_exists(conn, 'users'):
        op.execute("""
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        # Insert default admin user
        op.execute("""
            INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
            VALUES ('default-admin', 'admin', 'admin@frontbase.dev', '$2b$10$KIXl9Q9q9Q9q9Q9q9Q9q9uJ1J1J1J1J1J1J1J1J1J1J1J1J1J1J1J1', datetime('now'), datetime('now'))
        """)
    
    # User sessions table
    if not table_exists(conn, 'user_sessions'):
        op.execute("""
            CREATE TABLE user_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                session_token TEXT UNIQUE NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)
    
    # User settings table
    if not table_exists(conn, 'user_settings'):
        op.execute("""
            CREATE TABLE user_settings (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                supabase_url TEXT,
                supabase_anon_key TEXT,
                settings_data TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)
    
    # Page views table
    if not table_exists(conn, 'page_views'):
        op.execute("""
            CREATE TABLE page_views (
                id TEXT PRIMARY KEY,
                page_id TEXT NOT NULL,
                user_agent TEXT,
                ip_address TEXT,
                referrer TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (page_id) REFERENCES pages (id)
            )
        """)
    
    # RLS Policy Metadata table
    if not table_exists(conn, 'rls_policy_metadata'):
        op.execute("""
            CREATE TABLE rls_policy_metadata (
                id TEXT PRIMARY KEY,
                table_name TEXT NOT NULL,
                policy_name TEXT NOT NULL,
                form_data TEXT NOT NULL,
                generated_using TEXT,
                generated_check TEXT,
                sql_hash TEXT,
                created_at DEFAULT (datetime('now')),
                updated_at DEFAULT (datetime('now')),
                UNIQUE(table_name, policy_name)
            )
        """)
    
    # Auth Forms table
    if not table_exists(conn, 'auth_forms'):
        op.execute("""
            CREATE TABLE auth_forms (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('login', 'signup', 'both')),
                config TEXT DEFAULT '{}',
                target_contact_type TEXT,
                allowed_contact_types TEXT DEFAULT '[]',
                redirect_url TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DEFAULT (datetime('now')),
                updated_at DEFAULT (datetime('now'))
            )
        """)
    
    # ============================
    # DB-SYNCHRONIZER TABLES
    # ============================
    
    # Sync configs table (legacy - may already exist from sync service)
    if not table_exists(conn, 'sync_configs'):
        op.execute("""
            CREATE TABLE sync_configs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_config TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_config TEXT NOT NULL,
                sync_direction TEXT NOT NULL DEFAULT 'bidirectional',
                status TEXT DEFAULT 'active',
                last_sync_at TEXT,
                next_sync_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
    
    # Field mappings table
    if not table_exists(conn, 'field_mappings'):
        op.execute("""
            CREATE TABLE field_mappings (
                id TEXT PRIMARY KEY,
                sync_config_id TEXT NOT NULL,
                source_table TEXT NOT NULL,
                source_field TEXT NOT NULL,
                target_table TEXT NOT NULL,
                target_field TEXT NOT NULL,
                transformation_rule TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (sync_config_id) REFERENCES sync_configs (id) ON DELETE CASCADE
            )
        """)
    
    # Sync jobs table
    if not table_exists(conn, 'sync_jobs'):
        op.execute("""
            CREATE TABLE sync_jobs (
                id TEXT PRIMARY KEY,
                sync_config_id TEXT NOT NULL,
                job_type TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                started_at TEXT,
                completed_at TEXT,
                records_processed INTEGER DEFAULT 0,
                records_failed INTEGER DEFAULT 0,
                error_message TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (sync_config_id) REFERENCES sync_configs (id) ON DELETE CASCADE
            )
        """)
    
    # Conflicts table
    if not table_exists(conn, 'conflicts'):
        op.execute("""
            CREATE TABLE conflicts (
                id TEXT PRIMARY KEY,
                sync_config_id TEXT NOT NULL,
                table_name TEXT NOT NULL,
                record_id TEXT NOT NULL,
                field_name TEXT NOT NULL,
                source_value TEXT,
                target_value TEXT,
                conflict_type TEXT NOT NULL,
                resolution TEXT,
                resolved_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (sync_config_id) REFERENCES sync_configs (id) ON DELETE CASCADE
            )
        """)


def downgrade() -> None:
    """Drop all Frontbase core tables."""
    # Drop in reverse order due to foreign key constraints
    tables = [
        'conflicts',
        'sync_jobs',
        'field_mappings',
        'sync_configs',
        'auth_forms',
        'rls_policy_metadata',
        'page_views',
        'user_settings',
        'user_sessions',
        'users',
        'assets',
        'app_variables',
        'pages',
        'project',
    ]
    
    for table in tables:
        op.execute(f"DROP TABLE IF EXISTS {table}")
