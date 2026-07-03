"""Edge infrastructure domain models — EdgeDatabase, EdgeCache, EdgeQueue, EdgeProviderAccount, EdgeEngine, EdgeGPUModel, EdgeAPIKey."""

from sqlalchemy import Table, Column, String, Text, Boolean, Integer, ForeignKey
from sqlalchemy.orm import relationship

from ..database.config import Base


# Association tables for multi-bindings
engine_datasources = Table(
    "engine_datasources",
    Base.metadata,
    Column("engine_id", String, ForeignKey("edge_engines.id", ondelete="CASCADE"), primary_key=True),
    Column("datasource_id", String(36), primary_key=True)
)

engine_storages = Table(
    "engine_storages",
    Base.metadata,
    Column("engine_id", String, ForeignKey("edge_engines.id", ondelete="CASCADE"), primary_key=True),
    Column("storage_id", String, ForeignKey("storage_providers.id", ondelete="CASCADE"), primary_key=True)
)


class EdgeDatabase(Base):
    """Named edge database connection — credentials for edge deployment targets.
    
    Each row represents a configured edge-compatible database (Turso, Neon, etc.)
    that deployment targets can reference. Replaces the old global Turso settings
    in settings.json.
    """
    __tablename__ = 'edge_databases'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)          # "Production Turso", "Staging Neon"
    provider = Column(String(50), nullable=False)        # "turso", "neon", "planetscale"
    db_url = Column(String(500), nullable=False)         # "libsql://your-db.turso.io"
    db_token = Column(String(1000), nullable=True)       # auth token (encrypted at rest)
    provider_account_id = Column(String, ForeignKey('edge_providers_accounts.id'), nullable=True)  # FK → Connected Account
    provider_config = Column(Text, nullable=True)          # JSON — provider-specific metadata (scoped tokens, account IDs)
    project_id = Column(String, ForeignKey('project.id'), nullable=True)
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)            # True = pre-seeded, cannot be deleted
    is_managed = Column(Boolean, default=False)            # True = Frontbase-provisioned (managed tier)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # Relationships
    edge_engines = relationship("EdgeEngine", back_populates="edge_database")
    provider_account = relationship("EdgeProviderAccount", foreign_keys=[provider_account_id])


class EdgeCache(Base):
    """Named edge cache connection — credentials for edge caching providers.
    
    Each row represents a configured edge-compatible cache (Upstash, Redis, etc.)
    that edge engines can reference. Replaces the old global Redis settings
    in settings.json.
    """
    __tablename__ = 'edge_caches'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)          # "Production Upstash", "Staging Redis"
    provider = Column(String(50), nullable=False)        # "upstash", "redis", "dragonfly"
    cache_url = Column(String(500), nullable=False)     # "https://xxx.upstash.io"
    cache_token = Column(String(1000), nullable=True)   # auth token (write-only to frontend)
    provider_account_id = Column(String, ForeignKey('edge_providers_accounts.id'), nullable=True)  # FK → Connected Account
    provider_config = Column(Text, nullable=True)         # JSON — provider-specific metadata (scoped tokens, account IDs)
    project_id = Column(String, ForeignKey('project.id'), nullable=True)
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)      # System caches are undeletable
    is_managed = Column(Boolean, default=False)            # True = Frontbase-provisioned (managed tier)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # Relationships
    edge_engines = relationship("EdgeEngine", back_populates="edge_cache")
    provider_account = relationship("EdgeProviderAccount", foreign_keys=[provider_account_id])


class EdgeQueue(Base):
    """Named edge queue connection — credentials for message queue providers.
    
    Each row represents a configured queue service (QStash, RabbitMQ, etc.)
    that edge engines can reference for durable workflow execution.
    Mirrors the EdgeDatabase / EdgeCache pattern.
    """
    __tablename__ = 'edge_queues'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)           # "Production QStash"
    provider = Column(String(50), nullable=False)         # "qstash", "rabbitmq", "bullmq", "sqs"
    queue_url = Column(String(500), nullable=False)      # "https://qstash.upstash.io"
    queue_token = Column(String(1000), nullable=True)    # Auth token / API key
    signing_key = Column(String(500), nullable=True)     # Provider-specific signing key
    next_signing_key = Column(String(500), nullable=True) # Key rotation (QStash)
    provider_config = Column(Text, nullable=True)        # JSON — extra provider-specific config
    provider_account_id = Column(String, ForeignKey('edge_providers_accounts.id'), nullable=True)  # FK → Connected Account
    project_id = Column(String, ForeignKey('project.id'), nullable=True)
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)
    is_managed = Column(Boolean, default=False)            # True = Frontbase-provisioned (managed tier)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # Relationships
    edge_engines = relationship("EdgeEngine", back_populates="edge_queue")
    provider_account = relationship("EdgeProviderAccount", foreign_keys=[provider_account_id])


class EdgeVector(Base):
    """Named edge vector DB connection — credentials for vector database providers.
    
    Each row represents a configured edge-compatible vector database (pgvector,
    cloudflare_vectorize, turso_vector, etc.) that edge engines can reference.
    Mirrors the EdgeDatabase / EdgeCache pattern.
    """
    __tablename__ = 'edge_vectors'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)
    provider = Column(String(50), nullable=False)        # "pgvector", "cloudflare_vectorize", "turso_vector", "embedded_lancedb"
    vector_url = Column(String(500), nullable=False)     # connection string / DSN or endpoint URL
    vector_token = Column(String(1000), nullable=True)   # auth token / credentials (encrypted at rest)
    provider_account_id = Column(String, ForeignKey('edge_providers_accounts.id'), nullable=True)  # FK → Connected Account
    provider_config = Column(Text, nullable=True)        # JSON configuration (e.g. dimensions, model configs)
    project_id = Column(String, ForeignKey('project.id'), nullable=True)
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # Relationships
    edge_engines = relationship("EdgeEngine", back_populates="edge_vector")
    provider_account = relationship("EdgeProviderAccount", foreign_keys=[provider_account_id])


class EdgeProviderAccount(Base):
    """Authenticated account for an edge provider (e.g., Cloudflare, Vercel).
    
    Stores credentials required to deploy and manage Edge Engines.
    Provides a ""Data Source"" like connection experience.
    """
    __tablename__ = 'edge_providers_accounts'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)          # "Personal Cloudflare", "My Docker Server"
    project_id = Column(String, ForeignKey('project.id'), nullable=True)
    provider = Column(String(50), nullable=False)       # "cloudflare", "docker", "vercel", "fastapi"
    provider_credentials = Column(Text, nullable=True)  # JSON — encrypted secrets (api_token, etc.)
    provider_metadata = Column(Text, nullable=True)      # JSON — non-secret info (account_id, org_name) for UI display
    is_active = Column(Boolean, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # Relationship
    edge_engines = relationship("EdgeEngine", back_populates="edge_provider")


# Portable engine-move status values (see docs/portable-engine-move-plan.md).
# An engine is 'moved_out' while a portable-move bundle has been exported and it
# awaits finalize (delete) or cancel (restore). Canonical value shared by the
# model, the router guards, and the move service (Step 3+).
MOVE_STATUS_MOVED_OUT = "moved_out"


class EdgeEngine(Base):
    """Edge engine deployed instance — a registered edge provider endpoint.
    
    Each row represents a deployment of the Edge Engine (worker/container)
    on a specific provider account (Cloudflare, Vercel, Docker, etc.).
    """
    __tablename__ = 'edge_engines'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)         # "frontbase-edge", "staging-docker"
    edge_provider_id = Column(String, ForeignKey('edge_providers_accounts.id'), nullable=True)
    adapter_type = Column(String(20), nullable=False)   # "edge", "automations", "full"
    url = Column(String(500), nullable=False)           # "https://my-site.pages.dev"
    edge_db_id = Column(String, ForeignKey('edge_databases.id'), nullable=True)
    edge_cache_id = Column(String, ForeignKey('edge_caches.id'), nullable=True)
    edge_queue_id = Column(String, ForeignKey('edge_queues.id'), nullable=True)
    edge_vector_id = Column(String, ForeignKey('edge_vectors.id'), nullable=True)
    edge_auth_id = Column(String, nullable=True)
    engine_config = Column(Text, nullable=True)         # JSON — e.g., {"worker_name": "frontbase-edge"}
    project_id = Column(String, ForeignKey('project.id'), nullable=True)
    is_active = Column(Boolean, default=True)
    is_system = Column(Boolean, default=False)           # True = pre-seeded, cannot be deleted
    is_imported = Column(Boolean, default=False)          # True = imported from provider, False = deployed from Frontbase
    is_shared = Column(Boolean, default=False)             # True = shared community engine, visible to all tenants
    is_managed = Column(Boolean, default=False)            # True = Frontbase-provisioned (managed tier)
    # --- Portable engine-move state (see docs/portable-engine-move-plan.md) ---
    # null normally; MOVE_STATUS_MOVED_OUT while a move bundle is exported and the
    # engine awaits finalize/cancel. The router refuses to deploy/reconfigure/
    # redeploy/toggle/rotate a moved_out engine so its state can't drift mid-move.
    move_status = Column(String(20), nullable=True)
    # sha256 hex of the one-time confirm token S. We never store bare S: export
    # embeds raw S in the sealed bundle, the target reveals it post-import, and the
    # user pastes it back to authorize finalize (constant-time hash compare).
    move_secret_hash = Column(String(128), nullable=True)
    # ISO timestamp set when the engine entered moved_out; the TTL prune auto-
    # reverts stale moves so a lost bundle never strands an engine forever.
    moved_out_at = Column(String, nullable=True)
    bundle_checksum = Column(String(64), nullable=True)  # SHA-256 of deployed JS bundle
    config_checksum = Column(String(64), nullable=True)  # SHA-256 of local config (db+cache+adapter+secrets)
    last_deployed_at = Column(String, nullable=True)     # ISO timestamp of last successful deploy
    last_synced_at = Column(String, nullable=True)       # ISO timestamp of last drift verification
    source_snapshot = Column(Text, nullable=True)        # JSON — { "path": "content", ... } captured on deploy
    is_forked = Column(Boolean, default=False)            # True when user has custom files outside frontbase-core/
    modified_core_files = Column(Text, nullable=True)     # JSON list of frontbase-core/ files user edited
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    # Relationships
    edge_database = relationship("EdgeDatabase", back_populates="edge_engines")
    edge_cache = relationship("EdgeCache", back_populates="edge_engines")
    edge_queue = relationship("EdgeQueue", back_populates="edge_engines")
    edge_vector = relationship("EdgeVector", back_populates="edge_engines")
    edge_provider = relationship("EdgeProviderAccount", back_populates="edge_engines")
    page_deployments = relationship("PageDeployment", back_populates="edge_engine", cascade="all, delete-orphan")
    gpu_models = relationship("EdgeGPUModel", back_populates="edge_engine", cascade="all, delete-orphan")
    api_keys = relationship("EdgeAPIKey", back_populates="edge_engine", cascade="all, delete-orphan")
    agent_profiles = relationship("EdgeAgentProfile", back_populates="edge_engine", cascade="all, delete-orphan")


class EdgeGPUModel(Base):
    """Edge GPU Model — a configured AI inference endpoint on an edge engine.
    
    Each row represents a specific AI model deployed to an edge engine.
    Provider-agnostic: the `provider` field selects the adapter (workers_ai, 
    huggingface, ollama, modal, etc.) while the router uses gpu_adapters.py.
    """
    __tablename__ = 'edge_gpu_models'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)            # "Llama 3.1 Chat"
    slug = Column(String(100), nullable=False)             # "llama-3-1-chat" (URL-safe)
    model_type = Column(String(50), nullable=False)        # "llm", "embedder", "stt", etc.
    provider = Column(String(50), nullable=False)          # "workers_ai", "huggingface", ...
    model_id = Column(String(200), nullable=False)         # "@cf/meta/llama-3.1-8b-instruct"
    endpoint_url = Column(String(500), nullable=True)      # Auto: "{engine_url}/api/ai/{slug}"
    provider_config = Column(Text, nullable=True)          # JSON — defaults (temperature, etc.)
    api_key = Column(Text, nullable=True)                   # Fernet-encrypted API key for non-CF providers
    base_url = Column(String(500), nullable=True)           # Custom API base URL (OpenAI-compatible, Ollama, etc.)
    edge_engine_id = Column(String, ForeignKey('edge_engines.id'), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    # Relationship
    edge_engine = relationship("EdgeEngine", back_populates="gpu_models")



class EdgeAPIKey(Base):
    """API key for securing tenant-facing edge endpoints.

    Keys are stored Fernet-encrypted (reversible) in key_hash.
    SHA-256 hash is derived at push-time for edge engine validation.
    Legacy keys store raw SHA-256 hashes and cannot be revealed.
    """
    __tablename__ = 'edge_api_keys'

    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)            # "Production Key"
    prefix = Column(String(20), nullable=False)            # "fb_sk_a1b2..." (for display)
    key_hash = Column(String(256), nullable=False, unique=True)  # Fernet-encrypted key (or legacy SHA-256)
    edge_engine_id = Column(String, ForeignKey('edge_engines.id'), nullable=True)  # null = all engines
    project_id = Column(String, ForeignKey('project.id'), nullable=True)
    is_active = Column(Boolean, default=True)
    scope = Column(String(20), nullable=False, default='user')  # user | management | all
    expires_at = Column(String, nullable=True)             # ISO datetime or null = never
    last_used_at = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # Relationship
    edge_engine = relationship("EdgeEngine", back_populates="api_keys")


class EdgeAgentProfile(Base):
    """An AI Agent Persona deployed to an Edge Engine.
    
    Contains system prompt instructions and granular CRUD permissions.
    Multiple profiles allow internal 'admin' agent interactions alongside
    restricted 'customer support' integrations inside the same edge runtime.
    """
    __tablename__ = 'edge_agent_profiles'

    id = Column(String, primary_key=True)
    engine_id = Column(String, ForeignKey('edge_engines.id'), nullable=False)
    project_id = Column(String, ForeignKey('project.id'), nullable=True)
    name = Column(String(100), nullable=False)            # "Admin Agent"
    slug = Column(String(50), nullable=False)             # "admin-agent"
    system_prompt = Column(Text, nullable=True)           # "You are a database admin..."
    permissions = Column(Text, nullable=True)             # JSON — { resource: [actions] } (deny-by-default)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # --- Feature-parity controls (added for workspace/edge agent parity) ---
    # Generation parameters surfaced to master admin / self-host. NULL = provider default.
    temperature = Column(String, nullable=True)           # "0.7" (stored as text for SQLite portability)
    max_tokens = Column(Integer, nullable=True)
    top_p = Column(String, nullable=True)                 # "0.9"
    # Auto-registration of internal API endpoints as agent tools.
    excluded_tools = Column(Text, nullable=True)          # JSON array of tool names to exclude
    max_auto_tools = Column(Integer, nullable=True)       # cap on auto-registered API tools (default 50)
    mcp_enabled = Column(Boolean, default=True)
    skills_enabled = Column(Boolean, default=True)

    # Relationship
    edge_engine = relationship("EdgeEngine", back_populates="agent_profiles")


class TenantSecretAudit(Base):
    """Audit trail of tenant-secrets operations on shared/community engines.

    Community engines store per-tenant secret blobs (datasources, auth, …)
    encrypted in the worker's state-DB, pushed by the control plane. This table
    is the authoritative, centralized record of those control-plane operations
    (push / delete / rotate) — who pushed what, when, and whether it succeeded.

    Lives in the backend DB (not the worker state-DB) because the control plane
    is the authority for tenant secrets and multi-tenant SaaS needs a unified,
    redeploy-surviving view across all workers. Mirrors the edge-side
    `edge_secret_audit` vault table, adapted for the multi-tenant model:
    `tenant_slug` + `kind` identify the blob instead of a single secret name.

    See docs/plans/phase-3-async-accessors.md (Part 2).
    """
    __tablename__ = 'tenant_secrets_audit'

    id = Column(String, primary_key=True)
    operation = Column(String(50), nullable=False)   # push | delete | rotate
    tenant_slug = Column(String(100), nullable=False)
    kind = Column(String(50), nullable=False)         # datasources | auth | agent_profiles | security | storage | (rotate='*')
    status = Column(String(20), nullable=False)       # success | failure
    error_message = Column(String(500), nullable=True)
    engine_id = Column(String, ForeignKey('edge_engines.id', ondelete='CASCADE'), nullable=True, index=True)
    initiated_by = Column(String(50), nullable=False)  # control_plane | api | worker
    initiated_by_user_id = Column(String, nullable=True)
    timestamp = Column(String, nullable=False, index=True)
    audit_metadata = Column(Text, nullable=True)      # JSON: rotation_id, key_version, etc.

    # Relationship
    edge_engine = relationship("EdgeEngine")
