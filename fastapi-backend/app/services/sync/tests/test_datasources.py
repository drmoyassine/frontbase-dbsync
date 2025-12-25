"""
Test datasources API endpoints.
"""

import pytest


@pytest.mark.asyncio
async def test_create_datasource(client):
    """Test creating a new datasource."""
    response = await client.post("/api/datasources", json={
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
    await client.post("/api/datasources", json={
        "name": "Test DB",
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "test",
    })
    
    response = await client.get("/api/datasources")
    
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_get_datasource(client):
    """Test getting a specific datasource."""
    # Create first
    create_response = await client.post("/api/datasources", json={
        "name": "Get Test",
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "test",
    })
    ds_id = create_response.json()["id"]
    
    response = await client.get(f"/api/datasources/{ds_id}")
    
    assert response.status_code == 200
    assert response.json()["name"] == "Get Test"


@pytest.mark.asyncio
async def test_delete_datasource(client):
    """Test deleting a datasource."""
    # Create first
    create_response = await client.post("/api/datasources", json={
        "name": "Delete Test",
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "test",
    })
    ds_id = create_response.json()["id"]
    
    # Delete
    response = await client.delete(f"/api/datasources/{ds_id}")
    assert response.status_code == 204
    
    # Verify deleted
    get_response = await client.get(f"/api/datasources/{ds_id}")
    assert get_response.status_code == 404
