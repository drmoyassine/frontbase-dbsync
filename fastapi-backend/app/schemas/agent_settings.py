"""Tenant / user-side Workspace Agent settings — Pydantic schemas.

These back the gear-icon settings modal in the Workspace Agent widget. The
schema is intentionally focused for the MVP: **General** generation parameters
(temperature, max_tokens, top_p, timeout) and a **System Prompt** override.

Precedence when applied in ``agent_executor`` (lowest → highest):

    1. Profile defaults  — master-admin / self-host per-profile config
                           (``agent_quota.get_profile_config``)
    2. Tenant defaults   — ``tenant_agent_settings`` row where ``user_id`` IS NULL
    3. User overrides    — ``tenant_agent_settings`` row for the acting user

Only fields explicitly provided at a higher layer override the layer below. A
``None`` value (e.g. ``max_tokens``) means "inherit the lower layer".
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AgentSettingsGeneral(BaseModel):
    """Generation parameters a tenant/user may override.

    ``max_tokens`` is optional: ``None`` means "use the model / profile default".
    The numeric fields use sentinel defaults only so the modal can render — at
    apply time only non-None values override the profile config.
    """

    model_config = ConfigDict(extra="forbid")

    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=200000)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    timeout_seconds: int = Field(default=60, ge=10, le=600)


class AgentSettingsSystem(BaseModel):
    """Optional custom system-prompt override.

    ``enabled=False`` (default) means "use the profile's system prompt". When
    ``enabled=True`` a non-empty ``custom_prompt`` is required.
    """

    model_config = ConfigDict(extra="forbid")

    enabled: bool = Field(default=False)
    custom_prompt: Optional[str] = Field(default=None, max_length=10000)

    @model_validator(mode="after")
    def _require_prompt_when_enabled(self) -> "AgentSettingsSystem":
        if self.enabled and not (self.custom_prompt and self.custom_prompt.strip()):
            raise ValueError("custom_prompt is required when enabled is true")
        return self


class AgentSettings(BaseModel):
    """Complete agent settings envelope persisted to ``tenant_agent_settings``."""

    model_config = ConfigDict(extra="forbid")

    general: AgentSettingsGeneral = Field(default_factory=AgentSettingsGeneral)
    system: AgentSettingsSystem = Field(default_factory=AgentSettingsSystem)


class SettingsResponse(BaseModel):
    """Response for GET /api/agent/settings.

    ``settings`` is the *effective* merged set (profile → tenant → user) so the
    modal shows the user exactly what their next turn will use.
    ``inherited_from`` describes the most specific layer that contributed.
    """

    model_config = ConfigDict(extra="forbid")

    settings: AgentSettings
    inherited_from: str = Field(
        default="default",
        description="user | tenant | profile | default",
    )
    can_modify_tenant: bool = Field(
        default=False,
        description="True when the caller may write tenant-wide (user_id IS NULL) settings",
    )


class SettingsUpdate(BaseModel):
    """Request body for PUT /api/agent/settings.

    ``scope`` selects which row is written: ``user`` (the caller's override) or
    ``tenant`` (tenant-wide default; requires admin / master).
    """

    model_config = ConfigDict(extra="forbid")

    general: AgentSettingsGeneral = Field(default_factory=AgentSettingsGeneral)
    system: AgentSettingsSystem = Field(default_factory=AgentSettingsSystem)
    scope: str = Field(default="user", pattern="^(user|tenant)$")
