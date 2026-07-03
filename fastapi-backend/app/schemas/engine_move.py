"""Pydantic schemas for the portable engine-move feature (Step 3+)."""

from pydantic import BaseModel, Field


class ExportRequest(BaseModel):
    """Request body for ``POST /api/edge-engines/{engine_id}/export``.

    The passphrase seals the bundle envelope and is its only transit protection for a
    cross-deployment move — treat it like a password. It is never stored.
    """

    passphrase: str = Field(
        ..., min_length=8, max_length=256,
        description="Passphrase to seal the bundle (>= 8 characters).",
    )


class ImportRequest(BaseModel):
    """Request body for ``POST /api/edge-engines/import``.

    ``bundle`` is the ``FBENG1.…`` string from an export; ``passphrase`` unseals it.
    On success the response includes ``confirm_secret`` (S), which the caller pastes
    back into the source to finalize the move.
    """

    bundle: str = Field(..., min_length=1, description="Sealed bundle from an export.")
    passphrase: str = Field(..., min_length=1, description="Passphrase used at export time.")


class FinalizeMoveRequest(BaseModel):
    """Request body for ``POST /api/edge-engines/{engine_id}/finalize-move``."""

    confirm_secret: str = Field(..., min_length=1, description="S, revealed by the target import.")


class MoveToProjectRequest(BaseModel):
    """Request body for ``POST /api/edge-engines/{engine_id}/move-to-project``.

    Same-deployment fast path: move the engine to another project in THIS deployment
    atomically (no bundle, no passphrase).
    """

    target_project_id: str = Field(..., min_length=1)

