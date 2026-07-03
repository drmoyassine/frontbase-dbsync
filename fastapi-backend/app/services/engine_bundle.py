"""
Portable Engine Move — seal/unseal envelope for cross-deployment engine transfer.

Lets a user **move** an Edge Engine (with all bindings, infra, credentials and
children) from one project to another — across tenants and across deployments
(self-host ↔ cloud) — via a sealed, pasteable string.

This module is the pure crypto core of the feature (see
``docs/portable-engine-move-plan.md``). It owns exactly one responsibility:
turn a manifest dict into an authenticated, versioned, self-describing bundle
string, and turn it back. No DB, no ORM, no app imports — so it can be unit-tested
in isolation and reused by the export/import service layer.

Design
------
- **Envelope encryption.** A random per-bundle ``data_key`` (Fernet key) encrypts
  the manifest. The ``data_key`` itself is wrapped by a key derived from a user
  **passphrase** via scrypt with a random salt. Stealing the bundle without the
  passphrase is useless; losing the passphrase is unrecoverable (by design).
- **Authentication for free.** Fernet is AES-128-CBC + HMAC-SHA256, so any tamper
  of the payload or the wrapped key fails as ``InvalidToken`` → ``TamperedBundle``.
- **Versioned + self-describing.** Every bundle carries ``SCHEMA_VERSION`` and a
  ``FBENG1`` prefix so a pasted blob is identifiable and future format changes can
  be rejected cleanly (``IncompatibleVersion``) instead of producing cryptic errors.
- **Local mode** (``passphrase=None``): same-deployment cross-tenant moves skip
  transport crypto entirely (source and target share ``FERNET_KEY``); the wire
  format stays uniform.

Security
--------
The manifest is treated as **plaintext bearer material** — callers MUST have
decrypted every at-rest secret with the source ``FERNET_KEY`` before sealing
(the envelope is the secrets' *only* protection in transit), and MUST re-encrypt
with the target ``FERNET_KEY`` after unsealing. The confirm-token ``_move_secret``
is placed *inside* the encrypted payload so it is recoverable only by a successful
unseal — never log the bundle, the passphrase, or ``_move_secret``.

The wire format, scrypt parameters, ``MAGIC`` prefix and ``SCHEMA_VERSION`` are
part of the bundle contract — do not change them without bumping the version.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import secrets
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

__all__ = [
    "SCHEMA_VERSION",
    "BUNDLE_PREFIX",
    "MAX_BUNDLE_BYTES",
    "seal",
    "unseal",
    "BundleError",
    "BadPassphrase",
    "TamperedBundle",
    "IncompatibleVersion",
    "OversizedBundle",
]

logger = logging.getLogger(__name__)

# ── Bundle contract (do not change without bumping SCHEMA_VERSION) ──────────

#: Version of the bundle *envelope* format. Bump when the wire structure changes;
#: old bundles then fail fast with ``IncompatibleVersion`` instead of mis-parsing.
SCHEMA_VERSION = 1

#: Human-visible prefix so a pasted blob is identifiable at a glance.
BUNDLE_PREFIX = "FBENG1"

#: Hard ceiling on bundle size. A realistic closure is ~10–20 KB; anything beyond
#: this signals a runaway export (e.g. thousands of datasources) and is rejected
#: rather than silently producing an unusable paste.
MAX_BUNDLE_BYTES = 256 * 1024  # 256 KB

# ── scrypt KDF parameters (interactive-grade; ~tens of ms per derivation) ───
# N=2^15 is the OWASP-recommended interactive minimum; r=8, p=1 are scrypt
# defaults. Memory ≈ 128 * N * r bytes (~32 MiB), CPU ≈ tens of ms.
_SCRYPT_N = 2 ** 15
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32            # → 32 raw bytes → urlsafe-b64 → valid Fernet key
_SALT_BYTES = 16


# ── Exceptions ──────────────────────────────────────────────────────────────

class BundleError(Exception):
    """Base class for all engine-bundle failures."""


class BadPassphrase(BundleError):
    """The passphrase was wrong, or a sealed bundle was opened without one."""


class TamperedBundle(BundleError):
    """The bundle is corrupt or has been modified after sealing."""


class IncompatibleVersion(BundleError):
    """The bundle's ``SCHEMA_VERSION`` is not supported by this code."""


class OversizedBundle(BundleError):
    """The sealed bundle exceeds ``MAX_BUNDLE_BYTES``."""


# ── Internal helpers ───────────────────────────────────────────────────────

def _kdf(passphrase: str, salt: bytes) -> bytes:
    """Derive a Fernet key from a passphrase + salt via scrypt.

    Returns urlsafe-base64 of 32 raw bytes, which is exactly the format Fernet
    expects for its key. The salt is random per-bundle, so identical passphrases
    produce unrelated keys across bundles.
    """
    kdf = Scrypt(salt=salt, length=_SCRYPT_DKLEN, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    raw = kdf.derive(passphrase.encode("utf-8"))
    return base64.urlsafe_b64encode(raw)


def _envelope_to_bundle(envelope: dict[str, Any]) -> str:
    """Serialize an envelope dict into the ``FBENG1.<b64>`` wire string."""
    payload = json.dumps(envelope, separators=(",", ":")).encode("utf-8")
    if len(payload) > MAX_BUNDLE_BYTES:
        raise OversizedBundle(
            f"sealed bundle is {len(payload)} bytes; limit is {MAX_BUNDLE_BYTES}"
        )
    return f"{BUNDLE_PREFIX}.{base64.urlsafe_b64encode(payload).decode('ascii')}"


def _bundle_to_envelope(bundle: str) -> dict[str, Any]:
    """Parse a ``FBENG1.<b64>`` wire string back into an envelope dict."""
    if not bundle.startswith(f"{BUNDLE_PREFIX}."):
        raise TamperedBundle(f"not a Frontbase engine bundle (expected '{BUNDLE_PREFIX}.' prefix)")
    try:
        payload = base64.urlsafe_b64decode(bundle.split(".", 1)[1])
        return json.loads(payload)
    except (ValueError, json.JSONDecodeError) as exc:
        raise TamperedBundle(f"corrupt envelope: {exc}") from exc


# ── Public API ─────────────────────────────────────────────────────────────

def seal(manifest: dict[str, Any], passphrase: str | None) -> str:
    """Seal ``manifest`` into an authenticated, versioned bundle string.

    Parameters
    ----------
    manifest:
        Arbitrary JSON-serializable dict. Callers are responsible for decrypting
        any at-rest secrets *before* calling this — the manifest travels as
        plaintext protected solely by the envelope.
    passphrase:
        - A non-empty string → **sealed mode**: envelope-encrypted with a key
          derived from the passphrase. Required to open.
        - ``None`` → **local mode**: no transport crypto (same-deployment move,
          where source and target share ``FERNET_KEY``). The wire format is still
          uniform so downstream code is identical.

    Returns
    -------
    A ``"FBENG1.<base64>"`` string safe to copy/paste or store in a ``.fbengine``
    file.
    """
    body_bytes = json.dumps(manifest, separators=(",", ":")).encode("utf-8")

    if passphrase is None:
        # Local mode — no transport crypto. Plaintext is base64 for a uniform wire
        # format; the target deployment already shares the secrets' FERNET_KEY.
        envelope = {
            "h": {"v": SCHEMA_VERSION, "mode": "local"},
            "b": base64.urlsafe_b64encode(body_bytes).decode("ascii"),
        }
        logger.debug("sealed engine bundle (local mode)")
        return _envelope_to_bundle(envelope)

    if not passphrase:
        raise BadPassphrase("passphrase must be a non-empty string or None (local mode)")

    # Sealed mode — envelope encryption.
    data_key = Fernet.generate_key()
    ciphertext = Fernet(data_key).encrypt(body_bytes)            # authenticated (AES128-CBC + HMAC-SHA256)
    salt = os.urandom(_SALT_BYTES)
    kek = _kdf(passphrase, salt)
    wrapped_key = Fernet(kek).encrypt(data_key)                  # authenticated

    envelope = {
        "h": {
            "v": SCHEMA_VERSION,
            "mode": "sealed",
            "salt": base64.urlsafe_b64encode(salt).decode("ascii"),
            "wrapped_key": wrapped_key.decode("ascii"),
        },
        "b": ciphertext.decode("ascii"),
    }
    logger.debug("sealed engine bundle (sealed mode, %d bytes plaintext)", len(body_bytes))
    return _envelope_to_bundle(envelope)


def unseal(bundle: str, passphrase: str | None) -> dict[str, Any]:
    """Open a bundle string back into the original manifest dict.

    Parameters
    ----------
    bundle:
        A ``"FBENG1.<base64>"`` string produced by :func:`seal`.
    passphrase:
        Must match the passphrase used at seal time for sealed-mode bundles.
        ``None`` is only valid for local-mode bundles.

    Raises
    ------
    TamperedBundle
        The blob is not a bundle, is corrupt, or has been modified.
    IncompatibleVersion
        The bundle's ``SCHEMA_VERSION`` is not supported here.
    BadPassphrase
        The passphrase was wrong, or none was supplied for a sealed bundle.

    Returns
    -------
    The original manifest dict.
    """
    envelope = _bundle_to_envelope(bundle)
    header = envelope.get("h") or {}
    body = envelope.get("b")

    if header.get("v") != SCHEMA_VERSION:
        raise IncompatibleVersion(
            f"bundle version {header.get('v')!r} is not supported (expected {SCHEMA_VERSION})"
        )
    if body is None:
        raise TamperedBundle("envelope missing body")

    if header.get("mode") == "local":
        # Local mode — no transport crypto.
        try:
            return json.loads(base64.urlsafe_b64decode(body))
        except (ValueError, json.JSONDecodeError) as exc:
            raise TamperedBundle(f"corrupt local-mode body: {exc}") from exc

    # Sealed mode — unwrap the data key with the passphrase-derived key.
    salt_b64 = header.get("salt")
    wrapped_key = header.get("wrapped_key")
    if not salt_b64 or not wrapped_key:
        raise TamperedBundle("envelope missing sealed-mode key material")

    if passphrase is None:
        raise BadPassphrase("this bundle is sealed; a passphrase is required to open it")

    try:
        salt = base64.urlsafe_b64decode(salt_b64)
        kek = _kdf(passphrase, salt)
        data_key = Fernet(kek).decrypt(wrapped_key.encode("ascii"))
    except InvalidToken:
        # Unwrap failed: either the passphrase is wrong, or the wrapped key was
        # tampered with. We do not distinguish, to avoid leaking which it is.
        raise BadPassphrase("wrong passphrase or corrupted key material") from None

    try:
        plaintext = Fernet(data_key).decrypt(body.encode("ascii"))
    except InvalidToken:
        # Key unwrapped fine but the payload fails authentication → tampering.
        raise TamperedBundle("payload failed authentication (bundle has been tampered with)") from None

    try:
        return json.loads(plaintext)
    except json.JSONDecodeError as exc:
        raise TamperedBundle(f"decrypted payload is not valid JSON: {exc}") from exc


def generate_move_secret() -> str:
    """Generate the confirm-token ``S`` for the move handshake.

    Embedded *inside* the sealed payload by the export service, it is recoverable
    only via a successful :func:`unseal`. The target reveals it to the user only
    after the import transaction commits; the user pastes it back into the source
    to authorize the destructive finalize. Lives here (not inline at the caller)
    so the token format is defined once and is easy to audit.
    """
    return secrets.token_urlsafe(18)
