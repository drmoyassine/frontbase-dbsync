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
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '0001_frontbase_core'
down_revision: Union[str, Sequence[str], None] = 'c5311426ba79'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(inspector, table_name: str) -> bool:
    """Check if a table exists (database-agnostic)."""
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    """Create all Frontbase core tables if they don't exist."""
    conn = op.get_bind()
    inspector = inspect(conn)
    dialect = conn.dialect.name  # 'sqlite' or 'postgresql'
    
    # Use appropriate datetime syntax
    now_func = "datetime('now')" if dialect == 'sqlite' else "NOW()"
    
    # ============================
    # FRONTBASE TABLES
    # ============================
    
    # Project table
    if not table_exists(inspector, 'project'):
        op.create_table('project',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('name', sa.Text(), nullable=False),
            sa.Column('description', sa.Text()),
            sa.Column('supabase_url', sa.Text()),
            sa.Column('supabase_anon_key', sa.Text()),
            sa.Column('supabase_service_key_encrypted', sa.Text()),
            sa.Column('users_config', sa.Text()),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.Column('updated_at', sa.Text(), nullable=False)
        )
        # Insert default project
        op.execute(f"""
            INSERT INTO project (id, name, description, created_at, updated_at) 
            VALUES ('default', 'My Frontbase Project', 'A new project created with Frontbase', {now_func}, {now_func})
        """)
    
    # Project Settings table (needed for 0003 migration)
    if not table_exists(inspector, 'project_settings'):
        op.create_table('project_settings',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('redis_url', sa.String(512), nullable=True),
            # redis_token and redis_type will be added in migration 0003
            sa.Column('redis_enabled', sa.Boolean(), server_default='false'),
            sa.Column('cache_ttl_data', sa.Integer(), server_default='60'),
            sa.Column('cache_ttl_count', sa.Integer(), server_default='300'),
            sa.Column('updated_at', sa.DateTime(timezone=True))
        )
    
    # Pages table
    if not table_exists(inspector, 'pages'):
        op.create_table('pages',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('name', sa.Text(), nullable=False),
            sa.Column('slug', sa.Text(), nullable=False, unique=True),
            sa.Column('title', sa.Text()),
            sa.Column('description', sa.Text()),
            sa.Column('keywords', sa.Text()),
            sa.Column('is_public', sa.Boolean(), server_default='true'),
            sa.Column('is_homepage', sa.Boolean(), server_default='false'),
            sa.Column('layout_data', sa.Text(), nullable=False),
            sa.Column('seo_data', sa.Text()),
            sa.Column('deleted_at', sa.Text()),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.Column('updated_at', sa.Text(), nullable=False)
        )
        # Insert default homepage
        layout_json = '{"content":[{"id":"heading-1","type":"Heading","props":{"text":"Welcome to Frontbase","level":"1"},"children":[]},{"id":"text-1","type":"Text","props":{"text":"Start building your amazing website with our visual page builder.","size":"lg"},"children":[]},{"id":"button-1","type":"Button","props":{"text":"Get Started","variant":"default","size":"lg"},"children":[]}],"root":{}}'
        seo_json = '{"openGraph":{"title":"Welcome to Frontbase","description":"Build amazing websites"},"twitter":{"card":"summary_large_image","title":"Welcome to Frontbase"}}'
        op.execute(f"""
            INSERT INTO pages (id, name, slug, title, description, keywords, is_public, is_homepage, layout_data, seo_data, created_at, updated_at)
            VALUES (
                'default-homepage', 'Home', 'home', 'Welcome to Frontbase',
                'Build amazing websites with our visual page builder',
                'frontbase, website builder, visual editor',
                true, true,
                '{layout_json.replace("'", "''")}',
                '{seo_json.replace("'", "''")}',
                {now_func}, {now_func}
            )
        """)
    
    # App variables table
    if not table_exists(inspector, 'app_variables'):
        op.create_table('app_variables',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('name', sa.Text(), nullable=False, unique=True),
            sa.Column('type', sa.Text(), nullable=False),
            sa.Column('value', sa.Text()),
            sa.Column('formula', sa.Text()),
            sa.Column('description', sa.Text()),
            sa.Column('created_at', sa.Text(), nullable=False)
        )
    
    # Assets table
    if not table_exists(inspector, 'assets'):
        op.create_table('assets',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('filename', sa.Text(), nullable=False),
            sa.Column('original_name', sa.Text(), nullable=False),
            sa.Column('mime_type', sa.Text(), nullable=False),
            sa.Column('size', sa.Integer(), nullable=False),
            sa.Column('file_path', sa.Text(), nullable=False),
            sa.Column('created_at', sa.Text(), nullable=False)
        )
    
    # Users table
    if not table_exists(inspector, 'users'):
        op.create_table('users',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('username', sa.Text(), nullable=False, unique=True),
            sa.Column('email', sa.Text(), nullable=False, unique=True),
            sa.Column('password_hash', sa.Text(), nullable=False),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.Column('updated_at', sa.Text(), nullable=False)
        )
        # Insert default admin user
        op.execute(f"""
            INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
            VALUES ('default-admin', 'admin', 'admin@frontbase.dev', '$2b$10$KIXl9Q9q9Q9q9Q9q9Q9q9uJ1J1J1J1J1J1J1J1J1J1J1J1J1J1J1J1', {now_func}, {now_func})
        """)
    
    # User sessions table
    if not table_exists(inspector, 'user_sessions'):
        op.create_table('user_sessions',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('user_id', sa.Text(), nullable=False),
            sa.Column('session_token', sa.Text(), nullable=False, unique=True),
            sa.Column('expires_at', sa.Text(), nullable=False),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
        )
    
    # User settings table
    if not table_exists(inspector, 'user_settings'):
        op.create_table('user_settings',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('user_id', sa.Text(), nullable=False),
            sa.Column('supabase_url', sa.Text()),
            sa.Column('supabase_anon_key', sa.Text()),
            sa.Column('settings_data', sa.Text()),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.Column('updated_at', sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
        )
    
    # Page views table
    if not table_exists(inspector, 'page_views'):
        op.create_table('page_views',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('page_id', sa.Text(), nullable=False),
            sa.Column('user_agent', sa.Text()),
            sa.Column('ip_address', sa.Text()),
            sa.Column('referrer', sa.Text()),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(['page_id'], ['pages.id'])
        )
    
    # RLS Policy Metadata table
    if not table_exists(inspector, 'rls_policy_metadata'):
        op.create_table('rls_policy_metadata',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('table_name', sa.Text(), nullable=False),
            sa.Column('policy_name', sa.Text(), nullable=False),
            sa.Column('form_data', sa.Text(), nullable=False),
            sa.Column('generated_using', sa.Text()),
            sa.Column('generated_check', sa.Text()),
            sa.Column('sql_hash', sa.Text()),
            sa.Column('created_at', sa.Text()),
            sa.Column('updated_at', sa.Text()),
            sa.UniqueConstraint('table_name', 'policy_name')
        )
    
    # Auth Forms table
    if not table_exists(inspector, 'auth_forms'):
        op.create_table('auth_forms',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('name', sa.Text(), nullable=False),
            sa.Column('type', sa.Text(), nullable=False),
            sa.Column('config', sa.Text(), server_default='{}'),
            sa.Column('target_contact_type', sa.Text()),
            sa.Column('allowed_contact_types', sa.Text(), server_default='[]'),
            sa.Column('redirect_url', sa.Text()),
            sa.Column('is_active', sa.Integer(), server_default='1'),
            sa.Column('created_at', sa.Text()),
            sa.Column('updated_at', sa.Text())
        )
    
    # ============================
    # DB-SYNCHRONIZER TABLES
    # ============================
    
    # Sync configs table
    if not table_exists(inspector, 'sync_configs'):
        op.create_table('sync_configs',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('name', sa.Text(), nullable=False),
            sa.Column('source_type', sa.Text(), nullable=False),
            sa.Column('source_config', sa.Text(), nullable=False),
            sa.Column('target_type', sa.Text(), nullable=False),
            sa.Column('target_config', sa.Text(), nullable=False),
            sa.Column('sync_direction', sa.Text(), nullable=False, server_default='bidirectional'),
            sa.Column('status', sa.Text(), server_default='active'),
            sa.Column('last_sync_at', sa.Text()),
            sa.Column('next_sync_at', sa.Text()),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.Column('updated_at', sa.Text(), nullable=False)
        )
    
    # Field mappings table
    if not table_exists(inspector, 'field_mappings'):
        op.create_table('field_mappings',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('sync_config_id', sa.Text(), nullable=False),
            sa.Column('source_table', sa.Text(), nullable=False),
            sa.Column('source_field', sa.Text(), nullable=False),
            sa.Column('target_table', sa.Text(), nullable=False),
            sa.Column('target_field', sa.Text(), nullable=False),
            sa.Column('transformation_rule', sa.Text()),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(['sync_config_id'], ['sync_configs.id'], ondelete='CASCADE')
        )
    
    # Sync jobs table
    if not table_exists(inspector, 'sync_jobs'):
        op.create_table('sync_jobs',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('sync_config_id', sa.Text(), nullable=False),
            sa.Column('job_type', sa.Text(), nullable=False),
            sa.Column('status', sa.Text(), server_default='pending'),
            sa.Column('started_at', sa.Text()),
            sa.Column('completed_at', sa.Text()),
            sa.Column('records_processed', sa.Integer(), server_default='0'),
            sa.Column('records_failed', sa.Integer(), server_default='0'),
            sa.Column('error_message', sa.Text()),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(['sync_config_id'], ['sync_configs.id'], ondelete='CASCADE')
        )
    
    # Conflicts table
    if not table_exists(inspector, 'conflicts'):
        op.create_table('conflicts',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('sync_config_id', sa.Text(), nullable=False),
            sa.Column('table_name', sa.Text(), nullable=False),
            sa.Column('record_id', sa.Text(), nullable=False),
            sa.Column('field_name', sa.Text(), nullable=False),
            sa.Column('source_value', sa.Text()),
            sa.Column('target_value', sa.Text()),
            sa.Column('conflict_type', sa.Text(), nullable=False),
            sa.Column('resolution', sa.Text()),
            sa.Column('resolved_at', sa.Text()),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(['sync_config_id'], ['sync_configs.id'], ondelete='CASCADE')
        )


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
        op.drop_table(table)
