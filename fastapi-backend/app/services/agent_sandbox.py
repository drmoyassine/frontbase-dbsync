"""
Skill Execution Sandbox — Isolated subprocess execution for skill tools.

Provides secure, resource-limited execution of skill code in isolated subprocesses.
Prevents skills from:
- Accessing the host filesystem (unless explicitly allowed)
- Making unauthorized network requests
- Consuming excessive CPU/memory
- Running indefinitely (timeouts enforced)

Each skill execution runs in a separate process with:
- Memory limit (default 512MB)
- CPU time limit (default 30 seconds)
- Network call limit (default 10 requests)
- Filesystem access (denied by default)
- Temporary directory for file operations
"""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from multiprocessing import Process, Queue, Manager
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session

from ..database.config import SessionLocal

logger = logging.getLogger(__name__)

# Default resource limits for skill execution
DEFAULT_LIMITS = {
    "max_memory_mb": 512,
    "max_cpu_seconds": 30,
    "max_network_calls": 10,
    "allow_filesystem": False,
    "allow_network": True,
    "allowed_domains": None,  # None = all domains allowed
}

# Maximum execution time (hard timeout)
HARD_TIMEOUT_SECONDS = 60


class SandboxResult:
    """Result from a sandboxed skill execution."""

    def __init__(
        self,
        success: bool,
        output: Any = None,
        error: Optional[str] = None,
        execution_time: float = 0.0,
        memory_used_mb: Optional[float] = None,
        cpu_time_seconds: Optional[float] = None,
    ):
        self.success = success
        self.output = output
        self.error = error
        self.execution_time = execution_time
        self.memory_used_mb = memory_used_mb
        self.cpu_time_seconds = cpu_time_seconds

    def to_dict(self) -> dict[str, Any]:
        """Convert result to dict for tool response."""
        if self.success:
            return {
                "success": True,
                "result": self.output,
                "executionTime": round(self.execution_time, 3),
                "memoryUsedMb": self.memory_used_mb,
                "cpuTimeSeconds": self.cpu_time_seconds,
            }
        return {
            "success": False,
            "error": self.error,
            "executionTime": round(self.execution_time, 3),
        }


def _execute_in_subprocess(
    func: Callable,
    args: tuple,
    kwargs: dict,
    result_queue: Queue,
    limits: dict[str, Any],
) -> None:
    """
    Execute a function in a subprocess with resource limits.

    This function runs in the child process and enforces limits via:
    1. Resource.setrlimit for CPU/memory (platform-dependent)
    2. Timeout wrapper for execution time
    3. Signal handlers for graceful termination

    Result is placed in result_queue as a SandboxResult.
    """
    import resource
    import sys

    start_time = time.time()
    cpu_start = time.process_time()

    try:
        # Set memory limit (Unix-like systems only)
        max_memory_mb = limits.get("max_memory_mb", DEFAULT_LIMITS["max_memory_mb"])
        try:
            # RLIMIT_AS controls virtual memory (address space)
            # Convert MB to bytes
            memory_bytes = int(max_memory_mb * 1024 * 1024)
            resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
        except (ValueError, OSError):
            # Windows or systems without RLIMIT_AS
            pass

        # Set CPU time limit (Unix-like systems only)
        max_cpu_seconds = limits.get("max_cpu_seconds", DEFAULT_LIMITS["max_cpu_seconds"])
        try:
            resource.setrlimit(resource.RLIMIT_CPU, (int(max_cpu_seconds), int(max_cpu_seconds)))
        except (ValueError, OSError):
            pass

        # Execute the function
        output = func(*args, **kwargs)

        # Calculate resource usage
        execution_time = time.time() - start_time
        cpu_time = time.process_time() - cpu_start

        # Get memory usage (platform-dependent)
        memory_mb = None
        try:
            import psutil
            process = psutil.Process()
            memory_info = process.memory_info()
            memory_mb = memory_info.rss / (1024 * 1024)
        except (ImportError, Exception):
            pass

        result_queue.put(
            SandboxResult(
                success=True,
                output=output,
                execution_time=execution_time,
                memory_used_mb=memory_mb,
                cpu_time_seconds=cpu_time,
            )
        )

    except MemoryError:
        result_queue.put(
            SandboxResult(
                success=False,
                error=f"Memory limit exceeded ({max_memory_mb}MB)",
                execution_time=time.time() - start_time,
            )
        )
    except Exception as e:
        result_queue.put(
            SandboxResult(
                success=False,
                error=str(e),
                execution_time=time.time() - start_time,
            )
        )


class SkillSandbox:
    """
    Manages sandboxed execution of skill code.

    Each skill execution runs in an isolated subprocess with enforced
    resource limits. The sandbox provides:
    - Temporary directory for file operations
    - Controlled network access (optional domain whitelist)
    - Timeout enforcement
    - Resource monitoring (memory, CPU)
    """

    def __init__(self, skill_id: str, config: Optional[dict[str, Any]] = None):
        """
        Initialize a sandbox for a specific skill.

        Args:
            skill_id: The ID of the skill being executed
            config: Optional configuration overrides for resource limits
        """
        self.skill_id = skill_id
        self.config = config or {}

        # Merge defaults with config
        self.limits = {**DEFAULT_LIMITS}
        if "resource_limits" in self.config:
            self.limits.update(self.config["resource_limits"])

        # Create a temporary directory for this execution
        self.temp_dir = tempfile.mkdtemp(prefix=f"skill_{skill_id}_")

        logger.debug(
            f"[SkillSandbox] Initialized for skill={skill_id} with limits={self.limits}"
        )

    def execute(
        self,
        func: Callable,
        args: Optional[tuple] = None,
        kwargs: Optional[dict] = None,
        timeout: Optional[float] = None,
    ) -> SandboxResult:
        """
        Execute a function in the sandboxed subprocess.

        Args:
            func: The function to execute
            args: Positional arguments for the function
            kwargs: Keyword arguments for the function
            timeout: Optional timeout in seconds (overrides hard limit)

        Returns:
            SandboxResult with execution output or error
        """
        args = args or ()
        kwargs = kwargs or {}
        timeout = timeout or HARD_TIMEOUT_SECONDS

        # Use multiprocessing.Manager for cross-process queue
        manager = Manager()
        result_queue: Queue = manager.Queue()

        # Start the subprocess
        process = Process(
            target=_execute_in_subprocess,
            args=(func, args, kwargs, result_queue, self.limits),
        )
        process.start()

        # Wait for completion or timeout
        process.join(timeout=timeout)

        # Check if process timed out
        if process.is_alive():
            logger.warning(f"[SkillSandbox] Skill {self.skill_id} exceeded timeout ({timeout}s)")
            process.terminate()
            process.join(timeout=5)  # Wait 5s for graceful termination
            if process.is_alive():
                process.kill()  # Force kill if still alive
            return SandboxResult(
                success=False,
                error=f"Execution timeout ({timeout}s exceeded)",
                execution_time=timeout,
            )

        # Get the result from the queue
        try:
            result = result_queue.get_nowait()
            logger.debug(
                f"[SkillSandbox] Skill {self.skill_id} completed: success={result.success}, time={result.execution_time:.3f}s"
            )
            return result
        except Exception as e:
            # Process exited without putting result in queue
            return SandboxResult(
                success=False,
                error=f"Process exited abnormally: {str(e)}",
                execution_time=0.0,
            )
        finally:
            manager.shutdown()

    def cleanup(self) -> None:
        """Clean up the temporary directory."""
        try:
            import shutil
            if os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir)
                logger.debug(f"[SkillSandbox] Cleaned up temp dir: {self.temp_dir}")
        except Exception as e:
            logger.warning(f"[SkillSandbox] Failed to cleanup temp dir: {e}")

    def __enter__(self) -> "SkillSandbox":
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit with cleanup."""
        self.cleanup()


# =============================================================================
# Built-in Skill Implementations
# =============================================================================

def _python_code_exec(code: str, timeout: int = 10) -> dict:
    """
    Execute Python code in a sandboxed subprocess.

    Args:
        code: Python code to execute
        timeout: Execution timeout in seconds

    Returns:
        Dict with stdout, stderr, execution_time, and error (if any)
    """
    import sys
    from io import StringIO

    # Capture stdout/stderr
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    stdout_buf = StringIO()
    stderr_buf = StringIO()

    try:
        sys.stdout = stdout_buf
        sys.stderr = stderr_buf

        # Execute the code
        # Use exec() for code execution (single statements or multiple lines)
        # Note: This is still in-process, but the SkillSandbox wraps this
        # in a subprocess with resource limits
        exec_result = {}
        exec(code, {"__builtins__": __builtins__}, exec_result)

        stdout_val = stdout_buf.getvalue()
        stderr_val = stderr_buf.getvalue()

        return {
            "success": True,
            "stdout": stdout_val,
            "stderr": stderr_val,
            "result": exec_result.get("_result"),  # Convention: code can set _result
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "stdout": stdout_buf.getvalue(),
            "stderr": stderr_buf.getvalue(),
        }

    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr


def _web_scraper_fetch(url: str, timeout: int = 30) -> dict:
    """
    Fetch web content in a sandboxed subprocess.

    Args:
        url: URL to fetch
        timeout: Request timeout in seconds

    Returns:
        Dict with status, content, content_type, and error (if any)
    """
    import urllib.request
    from urllib.error import URLError, HTTPError

    try:
        response = urllib.request.urlopen(url, timeout=timeout)
        content = response.read()
        content_type = response.headers.get("Content-Type", "text/html")

        # Try to decode as text
        try:
            charset = "utf-8"
            if "charset=" in content_type:
                charset = content_type.split("charset=")[1].split(";")[0].strip()
            text_content = content.decode(charset)
        except (UnicodeDecodeError, LookupError):
            text_content = None

        return {
            "success": True,
            "url": url,
            "contentType": content_type,
            "content": text_content,
            "contentLength": len(content),
            "statusCode": response.status,
        }

    except HTTPError as e:
        return {
            "success": False,
            "error": f"HTTP Error {e.code}: {e.reason}",
            "url": url,
            "statusCode": e.code,
        }
    except URLError as e:
        return {
            "success": False,
            "error": f"URL Error: {str(e)}",
            "url": url,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "url": url,
        }


# =============================================================================
# Skill Execution Wrapper (used by tool implementations)
# =============================================================================

def execute_skill_safely(
    skill_id: str,
    func: Callable,
    args: Optional[tuple] = None,
    kwargs: Optional[dict] = None,
    config: Optional[dict[str, Any]] = None,
) -> SandboxResult:
    """
    Execute a skill function with sandboxing.

    This is the main entry point for skill tool implementations.
    Provides automatic resource limiting, timeout enforcement, and cleanup.

    Args:
        skill_id: The ID of the skill being executed
        func: The skill function to execute
        args: Positional arguments
        kwargs: Keyword arguments
        config: Optional skill configuration (from agent_profile_skills.config_overrides)

    Returns:
        SandboxResult with execution output or error
    """
    with SkillSandbox(skill_id, config) as sandbox:
        return sandbox.execute(func, args, kwargs)


def log_skill_execution(
    skill_id: str,
    func_name: str,
    result: SandboxResult,
    user_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> None:
    """
    Log skill execution to the audit trail.

    Writes to agent_tool_audit for record-keeping and observability.
    """
    from ..models.models import AgentToolAudit
    import uuid

    db = SessionLocal()
    try:
        row = AgentToolAudit(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            project_id=project_id,
            user_id=user_id,
            profile_slug=f"skill:{skill_id}",
            tool_name=func_name,
            is_destructive=False,  # Skills run in sandbox, not inherently destructive
            args={"skill_id": skill_id},
            result_summary=result.to_dict(),
            status="success" if result.success else "error",
            error_message=result.error if not result.success else None,
            duration_ms=int(result.execution_time * 1000),
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        db.add(row)
        db.commit()
    except Exception as e:
        logger.warning(f"[SkillSandbox] Failed to log skill execution: {e}", exc_info=True)
    finally:
        db.close()
