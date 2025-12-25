import json
import logging
from typing import Any, Dict, List, Optional
from datetime import timedelta
from app.services.sync.redis_client import get_redis_client

logger = logging.getLogger("app.services.state_manager")

class StateManager:
    """
    Manages "in-flight" sync data in Redis.
    Uses Redis as a temporary buffer for records captured from Master
    before they are processed and flushed to Slave.
    """
    
    def __init__(self, sync_job_id: str, ttl_hours: int = 4):
        self.job_id = sync_job_id
        self.ttl = timedelta(hours=ttl_hours)
        self.redis = None
        
    async def _init_redis(self):
        if not self.redis:
            self.redis = await get_redis_client()
            
    def _get_record_key(self, record_id: str) -> str:
        return f"sync:job:{self.job_id}:record:{record_id}"
        
    def _get_job_captured_set_key(self) -> str:
        return f"sync:job:{self.job_id}:captured"

    async def capture_record(self, record_id: str, data: Dict[str, Any]):
        """Store a captured record from master in Redis."""
        await self._init_redis()
        if not self.redis:
            logger.warning("Redis not available, skipping capture")
            return

        key = self._get_record_key(record_id)
        # Store metadata and raw data
        record_state = {
            "id": record_id,
            "data": data,
            "status": "captured",
            "captured_at": None # To be filled if needed
        }
        
        await self.redis.setex(
            key,
            int(self.ttl.total_seconds()),
            json.dumps(record_state)
        )
        
        # Add to the set of captured records for this job
        await self.redis.sadd(self._get_job_captured_set_key(), record_id)
        await self.redis.expire(self._get_job_captured_set_key(), int(self.ttl.total_seconds()))

    async def get_record(self, record_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a record's state from Redis."""
        await self._init_redis()
        if not self.redis:
            return None
            
        key = self._get_record_key(record_id)
        data = await self.redis.get(key)
        return json.loads(data) if data else None

    async def update_record_status(self, record_id: str, status: str, resolved_data: Optional[Dict[str, Any]] = None):
        """Update the status and optionally the data of a record."""
        await self._init_redis()
        if not self.redis:
            return

        key = self._get_record_key(record_id)
        current = await self.get_record(record_id)
        if not current:
            return
            
        current["status"] = status
        if resolved_data:
            current["resolved_data"] = resolved_data
            
        await self.redis.setex(
            key,
            int(self.ttl.total_seconds()),
            json.dumps(current)
        )

    async def list_captured_ids(self) -> List[str]:
        """List all record IDs captured for this job."""
        await self._init_redis()
        if not self.redis:
            return []
            
        ids = await self.redis.smembers(self._get_job_captured_set_key())
        return [id_bytes.decode('utf-8') if isinstance(id_bytes, bytes) else id_bytes for id_bytes in ids]

    async def cleanup_job(self):
        """Manually trigger cleanup for a job's Redis data (optional as TTL handles it)."""
        await self._init_redis()
        if not self.redis:
            return
            
        ids = await self.list_captured_ids()
        for rid in ids:
            await self.redis.delete(self._get_record_key(rid))
        await self.redis.delete(self._get_job_captured_set_key())
