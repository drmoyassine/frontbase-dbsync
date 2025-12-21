DB Synchronizer Microservice - Implementation Plan
A FastAPI microservice for multi-source database synchronization with master/slave architecture, field mapping, and conflict resolution.

User Review Required
WARNING

This is a large feature requiring a new Python microservice. Please confirm:

Should the microservice run on a separate port (default: 8001) alongside the Express server?
Should we add Docker Compose service for the Python microservice?
For WordPress sync - are you syncing to WordPress REST API or direct database connection?
IMPORTANT

The plan uses Drizzle Kit for schema introspection but the sync engine and adapters are in Python. This hybrid approach lets FastAPI handle async jobs while leveraging Drizzle's PostgreSQL capabilities through Node.js subprocess calls when needed.

Architecture
External DBs
Adapters
FastAPI Microservice
Frontend
DatabasePanel.tsx
SyncConfigPanel.tsx
FastAPI Endpoints
Sync Engine
Job Queue
SQLite Config
Supabase Adapter
WordPress Adapter
Postgres Adapter
Neon Adapter
Master DB
Slave 1
Slave 2
Proposed Changes
Service Core
[NEW] 
db-synchronizer/
New Python microservice directory containing:

main.py - FastAPI application entrypoint
requirements.txt - Python dependencies
config.py - Configuration and environment handling
database.py - SQLite config storage models
Adapters Layer
[NEW] 
adapters/
init
.py
Base adapter pattern with abstract DatabaseAdapter class defining:

connect()
 - Establish connection
get_schema() - Introspect table structure
read_records() - Fetch records with filters
upsert_records() - Insert/update records
delete_records() - Remove records
[NEW] 
adapters/supabase_adapter.py
PostgreSQL adapter using asyncpg for Supabase/Postgres connections.

[NEW] 
adapters/wordpress_adapter.py
WordPress adapter supporting wp_posts and wp_postmeta tables with proper serialization handling.

[NEW] 
adapters/neon_adapter.py
Neon serverless Postgres adapter with connection pooling support.

Sync Engine
[NEW] 
engine/sync_config.py
Pydantic models for sync configuration:

class SyncConfig(BaseModel):
    id: str
    name: str
    master_datasource_id: str
    slave_datasource_id: str
    field_mappings: List[FieldMapping]
    conflict_strategy: ConflictStrategy  # SOURCE_WINS, TARGET_WINS, MANUAL, MERGE, WEBHOOK
    webhook_url: Optional[str]  # For external conflict resolution
    sync_interval: Optional[int]  # Cron-style scheduling
[NEW] 
engine/field_mapper.py
Field mapping engine that transforms data between schemas:

Column name mapping (e.g., post_title → title)
Type coercion where needed
Computed/derived fields support
[NEW] 
engine/conflict_resolver.py
Conflict detection and resolution:

Detect conflicts by comparing master vs slave records
Apply resolution strategy
Store unresolved conflicts for manual review
Webhook callback option with retry logic
[NEW] 
engine/sync_executor.py
Async job execution using asyncio with:

Job queue management
Progress tracking
Error handling and retry logic
Batch processing for large datasets
API Routers
[NEW] 
routers/datasources.py
POST /api/datasources        # Register new datasource
GET  /api/datasources        # List all datasources
GET  /api/datasources/{id}   # Get datasource details
PUT  /api/datasources/{id}   # Update datasource
DELETE /api/datasources/{id} # Remove datasource
POST /api/datasources/{id}/test  # Test connection
[NEW] 
routers/sync_configs.py
POST /api/sync-configs           # Create sync configuration
GET  /api/sync-configs           # List sync configs
GET  /api/sync-configs/{id}      # Get config details
PUT  /api/sync-configs/{id}      # Update config
DELETE /api/sync-configs/{id}    # Delete config
[NEW] 
routers/sync.py
POST /api/sync/{configId}            # Execute sync job
GET  /api/sync/{jobId}/status        # Check job status
GET  /api/sync/{configId}/conflicts  # Get unresolved conflicts
POST /api/sync/{configId}/resolve    # Resolve conflict manually
[NEW] 
routers/webhooks.py
POST /webhooks/n8n/{configId}        # n8n trigger handler
POST /webhooks/zapier/{configId}     # Zapier trigger handler
POST /webhooks/activepieces/{configId}  # ActivePieces handler
Frontend Integration
[MODIFY] 
DatabasePanel.tsx
Add "DB Synchronizer" section below existing provider cards:

Link to sync configuration panel
Show active sync status summaries
[NEW] 
SyncConfigPanel.tsx
Main synchronization configuration UI:

Datasource connection wizard
Field mapping builder (drag-and-drop columns)
Conflict strategy selector
Sync execution controls
[NEW] 
FieldMappingEditor.tsx
Visual field mapping editor with:

Side-by-side schema view (master ↔ slave)
Drag-drop mapping lines
Type compatibility warnings
[NEW] 
ConflictResolutionPanel.tsx
Conflict resolution interface:

List of unresolved conflicts
Side-by-side record comparison
One-click resolution actions
Infrastructure
[MODIFY] 
docker-compose.yml
Add db-synchronizer service:

db-synchronizer:
  build: ./services/db-synchronizer
  ports:
    - "8001:8001"
  volumes:
    - ./data:/app/data
  environment:
    - DB_PATH=/app/data/sync-config.db
[MODIFY] 
server/index.js
Add proxy middleware to forward /api/sync/* requests to FastAPI service.

Verification Plan
Automated Tests
FastAPI Unit Tests (pytest):

cd services/db-synchronizer
pip install -r requirements.txt
pytest tests/ -v
Tests will cover:

Adapter connection logic (mocked)
Field mapping transformations
Conflict detection algorithms
API endpoint responses
Manual Verification
NOTE

I would appreciate your help to define manual test scenarios. Specifically:

Do you have test Supabase and WordPress instances I can use for testing?
What specific WordPress post fields should I focus on for the initial mapping?
Should conflict resolution be tested with real data or mock scenarios first?
Proposed manual test steps:

Start FastAPI service: uvicorn main:app --reload --port 8001
Register a Supabase master datasource via /api/datasources
Register a WordPress slave datasource
Create a sync config with field mappings
Execute sync and verify data appears in target
Create a conflict scenario and test resolution
Browser Testing
Navigate to /dashboard/database and verify new sync panel renders
Test datasource connection modal
Test field mapping UI interactions