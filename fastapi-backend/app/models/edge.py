"""Edge infrastructure domain models — EdgeDatabase, EdgeCache, EdgeQueue, EdgeProviderAccount, EdgeEngine, EdgeGPUModel, EdgeAPIKey."""

from sqlalchemy import Column, String, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship

from ..database.config import Base


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
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)            # True = pre-seeded, cannot be deleted
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
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)      # System caches are undeletable
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
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    # Relationships
    edge_engines = relationship("EdgeEngine", back_populates="edge_queue")
    provider_account = relationship("EdgeProviderAccount", foreign_keys=[provider_account_id])


class EdgeProviderAccount(Base):
    """Authenticated account for an edge provider (e.g., Cloudflare, Vercel).
    
    Stores credentials required to deploy and manage Edge Engines.
    Provides a ""Data Source"" like connection experience.
    """
    __tablename__ = 'edge_providers_accounts'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)          # "Personal Cloudflare", "My Docker Server"
    provider = Column(String(50), nullable=False)       # "cloudflare", "docker", "vercel", "fastapi"
    provider_credentials = Column(Text, nullable=True)  # JSON — encrypted secrets (api_token, etc.)
    provider_metadata = Column(Text, nullable=True)      # JSON — non-secret info (account_id, org_name) for UI display
    is_active = Column(Boolean, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # Relationship
    edge_engines = relationship("EdgeEngine", back_populates="edge_provider")


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
    engine_config = Column(Text, nullable=True)         # JSON — e.g., {"worker_name": "frontbase-edge"}
    is_active = Column(Boolean, default=True)
    is_system = Column(Boolean, default=False)           # True = pre-seeded, cannot be deleted
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
    edge_provider = relationship("EdgeProviderAccount", back_populates="edge_engines")
    page_deployments = relationship("PageDeployment", back_populates="edge_engine", cascade="all, delete-orphan")
    gpu_models = relationship("EdgeGPUModel", back_populates="edge_engine", cascade="all, delete-orphan")
    api_keys = relationship("EdgeAPIKey", back_populates="edge_engine", cascade="all, delete-orphan")


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
    edge_engine_id = Column(String, ForeignKey('edge_engines.id'), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    # Relationship
    edge_engine = relationship("EdgeEngine", back_populates="gpu_models")


class EdgeAPIKey(Base):
    """API key for securing tenant-facing edge endpoints (e.g. /v1/chat/completions).
    
    Keys are stored as SHA-256 hashes. The full key (fb_sk_<hex>) is shown
    once at creation and never stored. The prefix (first 10 chars) is kept
    for display purposes (e.g. 'fb_sk_a1b2...').
    """
    __tablename__ = 'edge_api_keys'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)            # "Production Key"
    prefix = Column(String(20), nullable=False)            # "fb_sk_a1b2..." (for display)
    key_hash = Column(String(128), nullable=False, unique=True)  # SHA-256 of full key
    edge_engine_id = Column(String, ForeignKey('edge_engines.id'), nullable=True)  # null = all engines
    is_active = Column(Boolean, default=True)
    expires_at = Column(String, nullable=True)             # ISO datetime or null = never
    last_used_at = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    # Relationship
    edge_engine = relationship("EdgeEngine", back_populates="api_keys")
