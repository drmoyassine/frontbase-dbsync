"""
Publish Strategy — Deployment target fan-out.

Provides fan_out_to_deployment_targets() which pushes published pages
to all active Edge Engine deployment targets via HTTP POST to /api/import.
"""

import httpx


async def fan_out_to_deployment_targets(payload: dict, scope: str = "pages") -> list[dict]:
    """
    Push a published page to all active deployment targets.
    
    Queries the deployment_targets table and POSTs to each target's /api/import.
    
    Args:
        payload: The serialized ImportPagePayload dict
        scope: Which targets to fan out to ("pages", "automations", "full")
    
    Returns:
        List of { target_name, target_url, success, error? } results.
        All errors are non-fatal — the primary publish result is authoritative.
    """
    from ..database.config import SessionLocal
    from ..models.models import EdgeEngine

    db = SessionLocal()
    try:
        # Query active targets matching the scope
        query = db.query(EdgeEngine).filter(EdgeEngine.is_active == True)
        if scope == "pages":
            query = query.filter(EdgeEngine.adapter_type.in_(["full"]))
        elif scope == "automations":
            query = query.filter(EdgeEngine.adapter_type.in_(["automations", "full"]))
        
        targets = query.all()
        
        # Detach before I/O (Release-Before-IO pattern, AGENTS.md §4.3)
        target_data = [
            {
                "id": t.id,
                "name": t.name,
                "url": t.url,
                "provider": t.edge_provider.provider if t.edge_provider else "unknown"
            }
            for t in targets
        ]
    finally:
        db.close()
    
    if not target_data:
        return []
    
    print(f"[FanOut] Publishing to {len(target_data)} deployment target(s)")
    
    results = []
    async with httpx.AsyncClient() as client:
        for target in target_data:
            import_url = f"{target['url'].rstrip('/')}/api/import"
            try:
                response = await client.post(
                    import_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=15.0,
                )
                success = response.status_code == 200
                result = {
                    "target_id": target["id"],
                    "target_name": target["name"],
                    "target_url": target["url"],
                    "provider": target["provider"],
                    "success": success,
                }
                if not success:
                    result["error"] = f"HTTP {response.status_code}: {response.text[:200]}"
                
                print(f"[FanOut] {'✅' if success else '❌'} {target['name']} ({target['provider']}): {import_url}")
                results.append(result)
            except Exception as e:
                print(f"[FanOut] ❌ {target['name']} ({target['provider']}): {e}")
                results.append({
                    "target_id": target["id"],
                    "target_name": target["name"],
                    "target_url": target["url"],
                    "provider": target["provider"],
                    "success": False,
                    "error": str(e),
                })
    
    return results
