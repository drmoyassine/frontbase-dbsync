"""
WordPress import cleanup utilities.

Provides scheduled cleanup of old imports to prevent memory/disk bloat.
Can be run via cron, Celery beat, or any other task scheduler.
"""

import asyncio
import logging
from typing import Optional

from app.services.wordpress.import_service import WordPressImportService
from app.services.wordpress.redis_progress_store import RedisImportProgressStore

logger = logging.getLogger(__name__)


async def cleanup_old_imports(
    max_age_seconds: int = 3600,
    use_redis: bool = False
) -> dict:
    """
    Clean up completed imports older than max_age_seconds.

    Args:
        max_age_seconds: Age in seconds (default 3600 = 1 hour)
        use_redis: If True, use Redis store (for multi-worker deployments)

    Returns:
        Dict with cleanup results: {"cleaned": int, "message": str}
    """
    try:
        if use_redis:
            store = RedisImportProgressStore()
        else:
            store = None  # Will use default in-memory store

        service = WordPressImportService(store=store)
        cleaned = await service.cleanup_old_imports(max_age_seconds=max_age_seconds)

        return {
            "cleaned": cleaned,
            "message": f"Cleaned {cleaned} import(s) older than {max_age_seconds}s"
        }
    except Exception as e:
        logger.exception("Failed to cleanup old imports")
        return {
            "cleaned": 0,
            "message": f"Cleanup failed: {str(e)}"
        }


def run_cleanup_sync(max_age_seconds: int = 3600, use_redis: bool = False) -> dict:
    """
    Synchronous wrapper for cleanup (useful for cron scripts).

    Usage in crontab:
        # Cleanup imports older than 1 hour, run every hour
        0 * * * * cd /path/to/app && python -c "
        from app.services.wordpress.cleanup import run_cleanup_sync
        result = run_cleanup_sync(max_age_seconds=3600)
        print(result['message'])
        "

    Args:
        max_age_seconds: Age in seconds (default 3600 = 1 hour)
        use_redis: If True, use Redis store

    Returns:
        Dict with cleanup results
    """
    return asyncio.run(cleanup_old_imports(max_age_seconds, use_redis))


async def cleanup_all_stalled_imports(timeout_seconds: int = 7200) -> dict:
    """
    Clean up imports that have been running for too long (stalled).

    Marks stalled imports as failed so they don't block progress display.

    Args:
        timeout_seconds: Time in seconds before an import is considered stalled
                        (default 7200 = 2 hours)

    Returns:
        Dict with results: {"fixed": int, "message": str}
    """
    # This would require iterating all imports which is expensive for Redis
    # For now, return a placeholder
    logger.info("Stalled import cleanup not yet implemented (requires import iteration)")
    return {
        "fixed": 0,
        "message": "Stalled import cleanup not yet implemented"
    }


# CLI entry point for manual testing or cron scripts
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Cleanup old WordPress imports")
    parser.add_argument(
        "--max-age",
        type=int,
        default=3600,
        help="Maximum age in seconds (default: 3600 = 1 hour)"
    )
    parser.add_argument(
        "--redis",
        action="store_true",
        help="Use Redis store instead of in-memory"
    )

    args = parser.parse_args()

    result = run_cleanup_sync(max_age_seconds=args.max_age, use_redis=args.redis)
    print(result["message"])
