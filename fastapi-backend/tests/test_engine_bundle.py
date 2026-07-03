"""
Tests for the portable engine-move seal/unseal envelope (``engine_bundle``).

These are the pure-crypto tests for Step 1 of the portable engine-move feature
(see ``docs/portable-engine-move-plan.md`` §8). They do NOT touch the database
or any ORM model — ``engine_bundle`` is intentionally dependency-free.

Coverage groups:
- seal/unseal roundtrip (sealed + local modes)
- passphrase handling (correct, wrong, missing, empty)
- tamper detection (envelope, wrapped key, payload)
- version guard
- confirm-token secrecy (``_move_secret`` lives only inside the payload)
- cross-key integration (source FERNET_KEY → envelope → target FERNET_KEY)
- format & size (prefix, base64, oversize guard)
"""

import base64
import json
import secrets

import pytest
from cryptography.fernet import Fernet

from app.services import engine_bundle as eb


PASSPHRASE = "correct horse battery staple"


# ── helpers ────────────────────────────────────────────────────────────────

def _sample_manifest() -> dict:
    """A small but structurally representative engine closure manifest."""
    return {
        "schema_version": 1,
        "source_edition": "cloud",
        "exported_at": "2026-07-03T00:00:00Z",
        "_move_secret": eb.generate_move_secret(),
        "engine": {"id": "eng-1", "name": "prod-edge", "adapter_type": "full"},
        "connected_accounts": [
            {"id": "acct-0", "provider": "cloudflare", "name": "CF acct",
             "provider_credentials": {"api_token": secrets.token_hex(24)}},
        ],
        "gpu_models": [
            {"id": "gpu-0", "name": "Model 0", "slug": "model-0",
             "api_key": secrets.token_hex(20)},
        ],
    }


def _b64_payload(bundle: str) -> dict:
    """Decode the wire envelope of a bundle (without unsealing)."""
    return json.loads(base64.urlsafe_b64decode(bundle.split(".", 1)[1]))


# ── seal/unseal roundtrip ──────────────────────────────────────────────────

class TestRoundtrip:
    def test_sealed_roundtrip_preserves_manifest(self):
        """Sealing then unsealing with the right passphrase recovers the manifest."""
        manifest = _sample_manifest()
        bundle = eb.seal(manifest, PASSPHRASE)
        opened = eb.unseal(bundle, PASSPHRASE)
        assert opened == manifest

    def test_bundle_is_prefixed_text(self):
        """Bundle is a string carrying the FBENG1 prefix for human identifiability."""
        bundle = eb.seal(_sample_manifest(), PASSPHRASE)
        assert isinstance(bundle, str)
        assert bundle.startswith(f"{eb.BUNDLE_PREFIX}.")


# ── passphrase handling ────────────────────────────────────────────────────

class TestPassphrase:
    def test_wrong_passphrase_rejected(self):
        """A wrong passphrase fails as BadPassphrase, not a raw crypto error."""
        bundle = eb.seal(_sample_manifest(), PASSPHRASE)
        with pytest.raises(eb.BadPassphrase):
            eb.unseal(bundle, "definitely the wrong passphrase")

    def test_sealed_bundle_requires_passphrase(self):
        """Unsealing a sealed bundle with None is rejected, not silently allowed."""
        bundle = eb.seal(_sample_manifest(), PASSPHRASE)
        with pytest.raises(eb.BadPassphrase):
            eb.unseal(bundle, None)

    def test_empty_passphrase_rejected(self):
        """An empty-string passphrase is rejected (use None for local mode)."""
        with pytest.raises(eb.BadPassphrase):
            eb.seal(_sample_manifest(), "")

    def test_wrong_passphrase_does_not_leak_through_tamper_error(self):
        """A passphrase mismatch is BadPassphrase, never TamperedBundle."""
        bundle = eb.seal(_sample_manifest(), PASSPHRASE)
        # Try several wrong passphrases to be robust against any single-string quirk.
        for bad in ("", " ", "x", "Correct Horse Battery Staple"):
            if not bad:
                continue  # empty is a separate rejection path
            with pytest.raises(eb.BadPassphrase):
                eb.unseal(bundle, bad)


# ── tamper detection ───────────────────────────────────────────────────────

class TestTamperDetection:
    def test_corrupt_envelope_rejected(self):
        """A truncated/garbled base64 body is TamperedBundle."""
        bundle = eb.seal(_sample_manifest(), PASSPHRASE)
        corrupt = f"{eb.BUNDLE_PREFIX}.!!!not-base64!!!"
        with pytest.raises(eb.TamperedBundle):
            eb.unseal(corrupt, PASSPHRASE)

    def test_missing_prefix_rejected(self):
        """A blob without the FBENG1 prefix is TamperedBundle."""
        bundle = eb.seal(_sample_manifest(), PASSPHRASE)
        no_prefix = bundle.split(".", 1)[1]
        with pytest.raises(eb.TamperedBundle):
            eb.unseal(no_prefix, PASSPHRASE)

    def test_tampered_payload_rejected(self):
        """Flipping bits in the ciphertext body fails authentication."""
        bundle = eb.seal(_sample_manifest(), PASSPHRASE)
        envelope = _b64_payload(bundle)
        body = envelope["b"]
        # Flip a character in the ciphertext tail (avoid the Fernet version prefix).
        flipped_char = "A" if not body[-4] == "A" else "B"
        envelope["b"] = body[:-4] + flipped_char * 4
        tampered = f"{eb.BUNDLE_PREFIX}." + base64.urlsafe_b64encode(
            json.dumps(envelope).encode()
        ).decode()
        with pytest.raises((eb.TamperedBundle, eb.BadPassphrase)):
            eb.unseal(tampered, PASSPHRASE)

    def test_tampered_wrapped_key_rejected(self):
        """Tampering the wrapped data key is caught by Fernet authentication."""
        bundle = eb.seal(_sample_manifest(), PASSPHRASE)
        envelope = _b64_payload(bundle)
        wk = envelope["h"]["wrapped_key"]
        envelope["h"]["wrapped_key"] = wk[:-4] + ("A" if wk[-4] != "A" else "B") * 4
        tampered = f"{eb.BUNDLE_PREFIX}." + base64.urlsafe_b64encode(
            json.dumps(envelope).encode()
        ).decode()
        with pytest.raises((eb.TamperedBundle, eb.BadPassphrase)):
            eb.unseal(tampered, PASSPHRASE)


# ── versioning ─────────────────────────────────────────────────────────────

class TestVersioning:
    def test_incompatible_version_rejected(self):
        """A future/incompatible schema version fails as IncompatibleVersion."""
        bundle = eb.seal(_sample_manifest(), PASSPHRASE)
        envelope = _b64_payload(bundle)
        envelope["h"]["v"] = eb.SCHEMA_VERSION + 1
        future = f"{eb.BUNDLE_PREFIX}." + base64.urlsafe_b64encode(
            json.dumps(envelope).encode()
        ).decode()
        with pytest.raises(eb.IncompatibleVersion):
            eb.unseal(future, PASSPHRASE)

    def test_current_version_is_one(self):
        """The shipped contract version is 1 (locked by the plan)."""
        assert eb.SCHEMA_VERSION == 1


# ── local mode (same-deployment) ───────────────────────────────────────────

class TestLocalMode:
    def test_local_roundtrip_no_passphrase(self):
        """Local mode seals/unseals without any passphrase."""
        manifest = _sample_manifest()
        bundle = eb.seal(manifest, None)
        assert eb.unseal(bundle, None) == manifest

    def test_local_bundle_unaffected_by_passphrase(self):
        """A local-mode bundle opens regardless of the passphrase argument."""
        manifest = _sample_manifest()
        bundle = eb.seal(manifest, None)
        # Local mode isn't encrypted, so any passphrase (or None) opens it.
        assert eb.unseal(bundle, PASSPHRASE) == manifest
        assert eb.unseal(bundle, None) == manifest


# ── confirm-token secrecy ──────────────────────────────────────────────────

class TestConfirmToken:
    def test_move_secret_not_in_raw_bundle(self):
        """The confirm token S appears ONLY inside the sealed payload, never raw."""
        manifest = _sample_manifest()
        s = manifest["_move_secret"]
        bundle = eb.seal(manifest, PASSPHRASE)
        # The raw bundle string must not contain the token.
        assert s not in bundle

    def test_move_secret_recoverable_only_via_unseal(self):
        """S is recoverable only after a successful unseal."""
        manifest = _sample_manifest()
        bundle = eb.seal(manifest, PASSPHRASE)
        opened = eb.unseal(bundle, PASSPHRASE)
        assert opened["_move_secret"] == manifest["_move_secret"]

    def test_generate_move_secret_unique_and_urlsafe(self):
        """Tokens are unique and urlsafe (safe to paste/display)."""
        tokens = {eb.generate_move_secret() for _ in range(256)}
        assert len(tokens) == 256  # all unique
        allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        for t in tokens:
            assert set(t) <= allowed


# ── cross-key integration (the heart of cross-deployment move) ─────────────

class TestCrossKeyIntegration:
    """Simulates two deployments with DIFFERENT FERNET_KEYs and proves a secret
    survives: source-key encrypt → decrypt on export → envelope → unseal →
    target-key re-encrypt → target-key decrypt (byte-identical)."""

    def test_secret_survives_cross_key_roundtrip(self):
        SOURCE_KEY = Fernet.generate_key()
        TARGET_KEY = Fernet.generate_key()

        def src_enc(s: str) -> str:
            return Fernet(SOURCE_KEY).encrypt(s.encode()).decode()

        def tgt_dec(blob: str) -> str:
            return Fernet(TARGET_KEY).decrypt(blob.encode()).decode()

        # 1. At rest in the source: the account's API token is source-encrypted.
        original_token = "cf_live_" + secrets.token_hex(24)
        source_row = {"id": "acct-0", "provider_credentials_ENC": src_enc(original_token)}

        # 2. Export DECRYPTS with the source key before sealing (envelope = only
        #    transit protection). Manifest carries plaintext.
        export_manifest = {"connected_accounts": [
            {"id": "acct-0",
             "provider_credentials": Fernet(SOURCE_KEY).decrypt(
                 source_row["provider_credentials_ENC"].encode()).decode()},
        ]}
        bundle = eb.seal(export_manifest, PASSPHRASE)

        # 3. Import unseals, then RE-ENCRYPTS with the TARGET key.
        recv = eb.unseal(bundle, PASSPHRASE)
        target_row = {"id": "acct-0",
                      "provider_credentials_ENC": Fernet(TARGET_KEY).encrypt(
                          recv["connected_accounts"][0]["provider_credentials"].encode()).decode()}

        # 4. A target-side reader decrypts with the TARGET key and recovers the
        #    original secret, byte-for-byte.
        assert tgt_dec(target_row["provider_credentials_ENC"]) == original_token

    def test_keys_are_genuinely_distinct(self):
        """Sanity: the two deployments' keys really can't read each other's ciphertext."""
        key_a = Fernet.generate_key()
        key_b = Fernet.generate_key()
        assert key_a != key_b
        ct = Fernet(key_a).encrypt(b"secret")
        with pytest.raises(Exception):
            Fernet(key_b).decrypt(ct)


# ── format & size ──────────────────────────────────────────────────────────

class TestFormatAndSize:
    def test_realistic_bundle_is_pasteable(self):
        """A realistic closure produces a bundle well under the pasteable ceiling."""
        manifest = {
            "schema_version": 1,
            "engine": {"id": "eng-1", "name": "prod-edge"},
            "connected_accounts": [
                {"id": f"acct-{i}", "provider": p,
                 "provider_credentials": {"api_token": secrets.token_hex(24)}}
                for i, p in enumerate(["cloudflare", "vercel", "upstash"])
            ],
            "gpu_models": [
                {"id": f"gpu-{i}", "api_key": secrets.token_hex(20)} for i in range(3)
            ],
            "datasources": [
                {"id": f"ds-{i}", "password": secrets.token_hex(16)} for i in range(4)
            ],
        }
        bundle = eb.seal(manifest, PASSPHRASE)
        # ~10–20 KB for this shape; comfortably pasteable / downloadable.
        assert len(bundle) < 64 * 1024

    def test_oversized_bundle_rejected(self):
        """An export past MAX_BUNDLE_BYTES raises OversizedBundle, not a paste blob."""
        import unittest.mock as mock
        huge = {"x": "A" * (eb.MAX_BUNDLE_BYTES + 1024)}
        with pytest.raises(eb.OversizedBundle):
            eb.seal(huge, PASSPHRASE)

    def test_envelope_shape_sealed(self):
        """A sealed bundle carries salt + wrapped_key + version + mode in its header."""
        bundle = eb.seal(_sample_manifest(), PASSPHRASE)
        envelope = _b64_payload(bundle)
        assert set(envelope.keys()) == {"h", "b"}
        h = envelope["h"]
        assert h["v"] == eb.SCHEMA_VERSION
        assert h["mode"] == "sealed"
        assert "salt" in h and "wrapped_key" in h

    def test_envelope_shape_local(self):
        """A local-mode bundle carries only version + mode in its header."""
        bundle = eb.seal(_sample_manifest(), None)
        envelope = _b64_payload(bundle)
        h = envelope["h"]
        assert h["v"] == eb.SCHEMA_VERSION
        assert h["mode"] == "local"
        assert "wrapped_key" not in h
