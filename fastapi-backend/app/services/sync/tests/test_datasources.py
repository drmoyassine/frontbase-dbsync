"""
Test datasources API endpoints.
"""

import pytest


@pytest.mark.asyncio
async def test_create_datasource(client):
    """Test creating a new datasource."""
    response = await client.post("/datasources", json={
        "name": "Test Supabase",
        "type": "supabase",
        "host": "db.example.supabase.co",
        "port": 5432,
        "database": "postgres",
        "username": "postgres",
        "password": "secret",
    })
    
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Supabase"
    assert data["type"] == "supabase"
    assert data["host"] == "db.example.supabase.co"


@pytest.mark.asyncio
async def test_list_datasources(client):
    """Test listing datasources."""
    # Create a datasource first
    await client.post("/datasources", json={
        "name": "Test DB",
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "test",
    })
    
    response = await client.get("/datasources")
    
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_get_datasource(client):
    """Test getting a specific datasource."""
    # Create first
    create_response = await client.post("/datasources", json={
        "name": "Get Test",
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "test",
    })
    ds_id = create_response.json()["id"]
    
    response = await client.get(f"/datasources/{ds_id}")
    
    assert response.status_code == 200
    assert response.json()["name"] == "Get Test"


@pytest.mark.asyncio
async def test_delete_datasource(client):
    """Test deleting a datasource."""
    # Create first
    create_response = await client.post("/datasources", json={
        "name": "Delete Test",
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "test",
    })
    ds_id = create_response.json()["id"]
    
    # Delete
    response = await client.delete(f"/datasources/{ds_id}")
    assert response.status_code == 204
    
    # Verify deleted
    get_response = await client.get(f"/datasources/{ds_id}")
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_datasource_tenant_isolation(client, db):
    """Test that datasources are scoped and isolated by tenant/project."""
    from app.services.sync.main import sync_app
    from app.middleware.tenant_context import get_tenant_context, TenantContext
    from app.models.models import Tenant, Project, User
    from datetime import datetime, UTC
    import uuid

    # Create dummy users, tenants and projects
    now = datetime.now(UTC).isoformat()
    uid = str(uuid.uuid4())[:8]
    
    user_a = User(id=f"u_a_{uid}", username=f"user_a_{uid}", email=f"user_a_{uid}@test.com", password_hash="hash", created_at=now, updated_at=now)
    user_b = User(id=f"u_b_{uid}", username=f"user_b_{uid}", email=f"user_b_{uid}@test.com", password_hash="hash", created_at=now, updated_at=now)
    db.add_all([user_a, user_b])
    await db.commit()

    tenant_a = Tenant(id=f"t_a_{uid}", slug=f"teama_{uid}", name="Team A", owner_id=user_a.id, created_at=now, updated_at=now)
    tenant_b = Tenant(id=f"t_b_{uid}", slug=f"teamb_{uid}", name="Team B", owner_id=user_b.id, created_at=now, updated_at=now)
    db.add_all([tenant_a, tenant_b])
    await db.commit()

    project_a = Project(id=f"p_a_{uid}", tenant_id=tenant_a.id, name="Proj A", created_at=now, updated_at=now)
    project_b = Project(id=f"p_b_{uid}", tenant_id=tenant_b.id, name="Proj B", created_at=now, updated_at=now)
    db.add_all([project_a, project_b])
    await db.commit()

    # Define contexts
    context_a = TenantContext(
        user_id=user_a.id,
        email=user_a.email,
        tenant_id=tenant_a.id,
        tenant_slug=tenant_a.slug,
        role="owner",
        is_master=False
    )
    context_b = TenantContext(
        user_id=user_b.id,
        email=user_b.email,
        tenant_id=tenant_b.id,
        tenant_slug=tenant_b.slug,
        role="owner",
        is_master=False
    )

    # 1. Under Tenant A context, create a datasource
    sync_app.dependency_overrides[get_tenant_context] = lambda: context_a
    response = await client.post("/datasources", json={
        "name": "Scoped DS",
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "test",
    })
    assert response.status_code == 201
    ds_data = response.json()
    ds_id = ds_data["id"]
    assert ds_data["project_id"] == project_a.id

    # 2. List datasources under Tenant A context -> should return the created datasource
    list_resp = await client.get("/datasources")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1
    assert list_resp.json()[0]["id"] == ds_id

    # 3. Switch to Tenant B context
    sync_app.dependency_overrides[get_tenant_context] = lambda: context_b

    # List under Tenant B -> should be empty
    list_resp_b = await client.get("/datasources")
    assert list_resp_b.status_code == 200
    assert len(list_resp_b.json()) == 0

    # Get Tenant A's datasource under Tenant B -> should return 404 (IDOR guard)
    get_resp_b = await client.get(f"/datasources/{ds_id}")
    assert get_resp_b.status_code == 404

    # Update Tenant A's datasource under Tenant B -> should return 404
    update_resp_b = await client.put(f"/datasources/{ds_id}", json={"name": "Hacked"})
    assert update_resp_b.status_code == 404

    # Delete Tenant A's datasource under Tenant B -> should return 404
    delete_resp_b = await client.delete(f"/datasources/{ds_id}")
    assert delete_resp_b.status_code == 404

    # Clear dependency overrides -> self-host mode / master bypass
    sync_app.dependency_overrides.clear()
    list_resp_self = await client.get("/datasources")
    assert list_resp_self.status_code == 200
    assert len(list_resp_self.json()) == 1
    assert list_resp_self.json()[0]["id"] == ds_id


@pytest.mark.asyncio
async def test_datasource_name_uniqueness_scoped(client, db):
    """Test that datasource name uniqueness is scoped to the project."""
    from app.services.sync.main import sync_app
    from app.middleware.tenant_context import get_tenant_context, TenantContext
    from app.models.models import Tenant, Project, User
    from datetime import datetime, UTC
    import uuid

    # Create dummy users, tenants and projects
    now = datetime.now(UTC).isoformat()
    uid = str(uuid.uuid4())[:8]
    
    user_a = User(id=f"u_a2_{uid}", username=f"user_a2_{uid}", email=f"user_a2_{uid}@test.com", password_hash="hash", created_at=now, updated_at=now)
    user_b = User(id=f"u_b2_{uid}", username=f"user_b2_{uid}", email=f"user_b2_{uid}@test.com", password_hash="hash", created_at=now, updated_at=now)
    db.add_all([user_a, user_b])
    await db.commit()

    tenant_a = Tenant(id=f"t_a2_{uid}", slug=f"teama2_{uid}", name="Team A2", owner_id=user_a.id, created_at=now, updated_at=now)
    tenant_b = Tenant(id=f"t_b2_{uid}", slug=f"teamb2_{uid}", name="Team B2", owner_id=user_b.id, created_at=now, updated_at=now)
    db.add_all([tenant_a, tenant_b])
    await db.commit()

    project_a = Project(id=f"p_a2_{uid}", tenant_id=tenant_a.id, name="Proj A2", created_at=now, updated_at=now)
    project_b = Project(id=f"p_b2_{uid}", tenant_id=tenant_b.id, name="Proj B2", created_at=now, updated_at=now)
    db.add_all([project_a, project_b])
    await db.commit()

    # Define contexts
    context_a = TenantContext(
        user_id=user_a.id,
        email=user_a.email,
        tenant_id=tenant_a.id,
        tenant_slug=tenant_a.slug,
        role="owner",
        is_master=False
    )
    context_b = TenantContext(
        user_id=user_b.id,
        email=user_b.email,
        tenant_id=tenant_b.id,
        tenant_slug=tenant_b.slug,
        role="owner",
        is_master=False
    )

    # 1. Under Tenant A context, create a datasource with name "Prod DB"
    sync_app.dependency_overrides[get_tenant_context] = lambda: context_a
    response = await client.post("/datasources", json={
        "name": "Prod DB",
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "test",
    })
    assert response.status_code == 201

    # 2. Try to create duplicate name under Tenant A -> should fail with 400
    response_dup = await client.post("/datasources", json={
        "name": "Prod DB",
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "test2",
    })
    assert response_dup.status_code == 400

    # 3. Switch to Tenant B context
    sync_app.dependency_overrides[get_tenant_context] = lambda: context_b

    # Create datasource with name "Prod DB" under Tenant B -> should succeed (per-project scoped uniqueness!)
    response_b = await client.post("/datasources", json={
        "name": "Prod DB",
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "test_b",
    })
    assert response_b.status_code == 201

    # Clear overrides
    sync_app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_test_raw_supabase_missing_api_url_does_not_raise(client, monkeypatch):
    """Regression (Sentry FRONTBASE-BACKEND-Z): testing a Supabase datasource with
    an API key but a blank API URL — and no Supabase Connected Account to resolve
    from — must return a clean success=False result with actionable guidance,
    not raise ValueError("Supabase requires API URL and API Key") into Sentry.
    """
    # No Supabase Connected Account configured (the 404 that triggered the issue).
    import app.core.credential_resolver as cred_resolver
    monkeypatch.setattr(cred_resolver, "get_supabase_context", lambda *a, **k: {})

    response = await client.post("/datasources/test-raw/", json={
        "name": "Studygram DB",
        "type": "supabase",
        "api_url": "",
        "api_key": "dummy-service-role-key",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "supabase requires" in data["error"].lower()
    assert "api url" in data["error"].lower()
    # Actionable guidance must steer the user toward providing creds / connecting an account
    assert data["suggestion"] is not None
    suggestion = data["suggestion"].lower()
    assert "settings" in suggestion or "account" in suggestion


@pytest.mark.asyncio
async def test_test_raw_supabase_both_credentials_missing(client, monkeypatch):
    """When both Supabase URL and key are blank and no account is connected, the
    endpoint returns a combined 'requires API URL and API Key' message."""
    import app.core.credential_resolver as cred_resolver
    monkeypatch.setattr(cred_resolver, "get_supabase_context", lambda *a, **k: {})

    response = await client.post("/datasources/test-raw/", json={
        "name": "Studygram DB",
        "type": "supabase",
        "api_url": "",
        "api_key": "",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "supabase requires api url and api key" in data["error"].lower()
