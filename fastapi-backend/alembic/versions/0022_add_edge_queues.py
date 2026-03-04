"""Extract EdgeQueue from EdgeCache + add edge_queue_id to EdgeEngine

Revision ID: 0022_add_edge_queues
Revises: 0021_add_qstash_to_edge_caches
Create Date: 2026-03-04

1. Creates the edge_queues table
2. Migrates existing QStash data from edge_caches → edge_queues
3. Adds edge_queue_id FK to edge_engines (backfilled from cache refs)
4. Drops QStash columns from edge_caches
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text
import uuid
from datetime import datetime


# revision identifiers, used by Alembic.
revision = '0022_add_edge_queues'
down_revision = '0021_add_qstash_to_edge_caches'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name
    inspector = inspect(conn)

    # ─── 1. Create edge_queues table ───
    existing_tables = inspector.get_table_names()
    if 'edge_queues' not in existing_tables:
        op.create_table(
            'edge_queues',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('provider', sa.String(50), nullable=False),
            sa.Column('queue_url', sa.String(500), nullable=False),
            sa.Column('queue_token', sa.String(1000), nullable=True),
            sa.Column('signing_key', sa.String(500), nullable=True),
            sa.Column('next_signing_key', sa.String(500), nullable=True),
            sa.Column('provider_config', sa.Text(), nullable=True),
            sa.Column('is_default', sa.Boolean(), default=False),
            sa.Column('is_system', sa.Boolean(), default=False),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
        )
        print("[Migration 0022] Created edge_queues table")

    # ─── 2. Migrate existing QStash data from edge_caches → edge_queues ───
    # Check if qstash_token column still exists in edge_caches
    cache_columns = [c['name'] for c in inspector.get_columns('edge_caches')]
    if 'qstash_token' in cache_columns:
        rows = conn.execute(text(
            "SELECT id, name, qstash_url, qstash_token, qstash_signing_key, qstash_next_signing_key "
            "FROM edge_caches WHERE qstash_token IS NOT NULL AND qstash_token != ''"
        )).fetchall()

        now = datetime.utcnow().isoformat()
        cache_to_queue_map = {}  # cache_id → queue_id (for backfill)

        for row in rows:
            queue_id = str(uuid.uuid4())
            cache_id = row[0]
            cache_name = row[1]
            qstash_url = row[2] or 'https://qstash.upstash.io'
            qstash_token = row[3]
            signing_key = row[4]
            next_signing_key = row[5]

            conn.execute(text(
                "INSERT INTO edge_queues (id, name, provider, queue_url, queue_token, "
                "signing_key, next_signing_key, provider_config, is_default, is_system, "
                "created_at, updated_at) "
                "VALUES (:id, :name, :provider, :queue_url, :queue_token, "
                ":signing_key, :next_signing_key, NULL, 0, 0, :created_at, :updated_at)"
            ), {
                "id": queue_id,
                "name": f"{cache_name} QStash",
                "provider": "qstash",
                "queue_url": qstash_url,
                "queue_token": qstash_token,
                "signing_key": signing_key,
                "next_signing_key": next_signing_key,
                "created_at": now,
                "updated_at": now,
            })
            cache_to_queue_map[cache_id] = queue_id
            print(f"[Migration 0022] Migrated QStash from cache '{cache_name}' → queue '{queue_id}'")

    # ─── 3. Add edge_queue_id FK to edge_engines ───
    engine_columns = [c['name'] for c in inspector.get_columns('edge_engines')]
    if 'edge_queue_id' not in engine_columns:
        if dialect == 'sqlite':
            # SQLite doesn't enforce FK constraints at ALTER TABLE time
            op.add_column('edge_engines', sa.Column('edge_queue_id', sa.String(), nullable=True))
        else:
            op.add_column('edge_engines', sa.Column(
                'edge_queue_id', sa.String(),
                sa.ForeignKey('edge_queues.id'), nullable=True
            ))
        print("[Migration 0022] Added edge_queue_id to edge_engines")

        # Backfill: engines referencing a cache with QStash → set edge_queue_id
        if 'qstash_token' in cache_columns:
            for cache_id, queue_id in cache_to_queue_map.items():
                conn.execute(text(
                    "UPDATE edge_engines SET edge_queue_id = :queue_id "
                    "WHERE edge_cache_id = :cache_id"
                ), {"queue_id": queue_id, "cache_id": cache_id})
            if cache_to_queue_map:
                print(f"[Migration 0022] Backfilled edge_queue_id for {len(cache_to_queue_map)} cache(s)")

    # ─── 4. Drop QStash columns from edge_caches ───
    if 'qstash_token' in cache_columns:
        qstash_cols = ['qstash_url', 'qstash_token', 'qstash_signing_key', 'qstash_next_signing_key']
        if dialect == 'sqlite':
            with op.batch_alter_table('edge_caches') as batch_op:
                for col_name in qstash_cols:
                    if col_name in cache_columns:
                        batch_op.drop_column(col_name)
        else:
            for col_name in qstash_cols:
                if col_name in cache_columns:
                    op.drop_column('edge_caches', col_name)
        print("[Migration 0022] Dropped QStash columns from edge_caches")


def downgrade():
    """Reverse: drop edge_queues, remove edge_queue_id, re-add QStash columns.

    NOTE: Migrated QStash data is NOT restored — accepted data loss on downgrade.
    """
    conn = op.get_bind()
    dialect = conn.dialect.name

    # Re-add QStash columns to edge_caches
    qstash_cols = [
        ('qstash_url', sa.String(500)),
        ('qstash_token', sa.String(1000)),
        ('qstash_signing_key', sa.String(500)),
        ('qstash_next_signing_key', sa.String(500)),
    ]
    for col_name, col_type in qstash_cols:
        op.add_column('edge_caches', sa.Column(col_name, col_type, nullable=True))

    # Drop edge_queue_id from edge_engines
    if dialect == 'sqlite':
        with op.batch_alter_table('edge_engines') as batch_op:
            batch_op.drop_column('edge_queue_id')
    else:
        op.drop_column('edge_engines', 'edge_queue_id')

    # Drop edge_queues table
    op.drop_table('edge_queues')
