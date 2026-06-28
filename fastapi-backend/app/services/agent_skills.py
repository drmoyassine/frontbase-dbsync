"""Built-in skills registry + seeding for the Workspace Agent.

A "skill" is a packaged bundle of tool definitions + config that can be
installed onto an agent profile. Built-in skills ship with Frontbase
(``is_builtin=True``, tenant-wide). This module defines the catalogue and
seeds the ``agent_skills`` table idempotently on first access.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..models.models import AgentSkill

logger = logging.getLogger(__name__)

# Built-in skill catalogue. ``tool_definitions`` is a JSON array of tool schemas
# the skill contributes when installed on a profile.
BUILTIN_SKILLS: list[dict[str, Any]] = [
    {
        "slug": "code-exec",
        "name": "Code Execution",
        "description": "Run sandboxed Python snippets and return structured output.",
        "category": "utility",
        "tool_definitions": [
            {"name": "run_python", "description": "Execute a Python code snippet and return stdout.", "parameters": {"code": "string"}}
        ],
    },
    {
        "slug": "web-scraper",
        "name": "Web Scraper",
        "description": "Fetch and extract content from a URL (title, text, links).",
        "category": "web",
        "tool_definitions": [
            {"name": "scrape_url", "description": "Fetch a URL and return its text content.", "parameters": {"url": "string"}}
        ],
    },
    {
        "slug": "document-parser",
        "name": "Document Parser",
        "description": "Parse uploaded documents (PDF, DOCX, CSV) into structured text.",
        "category": "data",
        "tool_definitions": [
            {"name": "parse_document", "description": "Extract text from a document file.", "parameters": {"file_id": "string"}}
        ],
    },
    {
        "slug": "database-query",
        "name": "Database Query",
        "description": "Run read-only SQL against a connected datasource and return rows.",
        "category": "data",
        "tool_definitions": [
            {"name": "query_sql", "description": "Execute a read-only SQL SELECT.", "parameters": {"datasource_id": "string", "sql": "string"}}
        ],
    },
    {
        "slug": "integration-http",
        "name": "HTTP Integration",
        "description": "Make authenticated HTTP requests to external APIs.",
        "category": "integration",
        "tool_definitions": [
            {"name": "http_request", "description": "Perform an HTTP request.", "parameters": {"method": "string", "url": "string", "body": "object"}}
        ],
    },
]


def seed_builtin_skills(db: Session) -> int:
    """Idempotently insert built-in skills that don't yet exist. Returns count added."""
    now = datetime.now(timezone.utc).isoformat()
    added = 0
    existing_slugs = {s.slug for s in db.query(AgentSkill).filter(AgentSkill.is_builtin == True).all()}  # noqa: E712
    for spec in BUILTIN_SKILLS:
        if spec["slug"] in existing_slugs:
            continue
        db.add(AgentSkill(
            id=str(uuid.uuid4()),
            slug=spec["slug"],
            name=spec["name"],
            description=spec["description"],
            category=spec["category"],
            tool_definitions=json.dumps(spec["tool_definitions"]),
            version="1.0.0",
            is_builtin=True,
            is_active=True,
            tenant_id=None,
            project_id=None,
            created_at=now,
            updated_at=now,
        ))
        added += 1
    if added:
        db.commit()
        logger.info("[agent_skills] seeded %d built-in skill(s)", added)
    return added
