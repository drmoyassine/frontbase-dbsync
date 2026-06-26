/**
 * Phase 2 — Vault Versioning & Rollback (provider layer, real SQLite).
 *
 * Exercises DrizzleStateProvider's edge-secret versioning directly against an
 * in-memory LocalSqliteProvider (migrations v14/v15/v16 applied via init()).
 * Covers: version bumping, snapshot creation, history listing, rollback
 * (append-only, collision-free), version deletion, and retention pruning.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalSqliteProvider } from '../storage/LocalSqliteProvider';

describe('Vault versioning & rollback (DrizzleStateProvider)', () => {
    let provider: LocalSqliteProvider;

    beforeEach(async () => {
        process.env.PAGES_DB_URL = ':memory:';
        delete process.env.SECRET_VERSION_RETENTION;
        provider = new LocalSqliteProvider();
        await provider.init();
    });

    it('bumps the version on each write and returns it', async () => {
        expect(await provider.setEdgeSecret('FRONTBASE_CACHE', 'ct-1')).toBe(1);
        expect(await provider.setEdgeSecret('FRONTBASE_CACHE', 'ct-2')).toBe(2);
        expect(await provider.setEdgeSecret('FRONTBASE_CACHE', 'ct-3')).toBe(3);

        const row = await provider.getEdgeSecret('FRONTBASE_CACHE');
        expect(row?.version).toBe(3);
        expect(row?.value).toBe('ct-3');
    });

    it('snapshots every write and marks only the latest as active', async () => {
        await provider.setEdgeSecret('FRONTBASE_DATASOURCES', 'a');
        await provider.setEdgeSecret('FRONTBASE_DATASOURCES', 'b');

        const versions = await provider.getSecretVersions('FRONTBASE_DATASOURCES');
        expect(versions).toHaveLength(2);
        // Newest first.
        expect(versions[0].version).toBe(2);
        expect(versions[0].isActive).toBe(true);
        expect(versions[0].createdVia).toBe('update');
        expect(versions[1].version).toBe(1);
        expect(versions[1].isActive).toBe(false);
        expect(versions[1].createdVia).toBe('create');
    });

    it('rollbacks restore prior ciphertext as a NEW (collision-free) version', async () => {
        await provider.setEdgeSecret('FRONTBASE_QUEUE', 'v1-ct');
        await provider.setEdgeSecret('FRONTBASE_QUEUE', 'v2-ct');
        await provider.setEdgeSecret('FRONTBASE_QUEUE', 'v3-ct');

        // Roll back to version 1's ciphertext.
        const result = await provider.rollbackSecret('FRONTBASE_QUEUE', 1);
        expect(result.version).toBe(4); // append-only → new monotonic version

        const row = await provider.getEdgeSecret('FRONTBASE_QUEUE');
        expect(row?.value).toBe('v1-ct');
        expect(row?.version).toBe(4);

        // Version history never collides: 4 distinct version rows.
        const versions = await provider.getSecretVersions('FRONTBASE_QUEUE');
        expect(versions).toHaveLength(4);
        // The active row is the rollback (v4, createdVia=rollback).
        const active = versions.find((v) => v.isActive);
        expect(active?.version).toBe(4);
        expect(active?.createdVia).toBe('rollback');
    });

    it('rollback throws when the target version does not exist', async () => {
        await provider.setEdgeSecret('FRONTBASE_STORAGE', 'only');
        await expect(provider.rollbackSecret('FRONTBASE_STORAGE', 99)).rejects.toThrow(/not found/i);
    });

    it('deleteSecretVersion refuses the active version but removes others', async () => {
        await provider.setEdgeSecret('FRONTBASE_AUTH', 'a');
        await provider.setEdgeSecret('FRONTBASE_AUTH', 'b');
        await provider.setEdgeSecret('FRONTBASE_AUTH', 'c');

        // Active is v3 — deleting it must fail.
        await expect(provider.deleteSecretVersion('FRONTBASE_AUTH', 3)).rejects.toThrow(/active/i);

        // v1 is non-active — deletable.
        await provider.deleteSecretVersion('FRONTBASE_AUTH', 1);
        const versions = await provider.getSecretVersions('FRONTBASE_AUTH');
        expect(versions.map((v) => v.version).sort((a, b) => a - b)).toEqual([2, 3]);
    });

    it('enforces the SECRET_VERSION_RETENTION limit (keeps N newest, never the active)', async () => {
        process.env.SECRET_VERSION_RETENTION = '3';
        // Write 6 versions; retention keeps the 3 newest non-active + always active.
        for (let i = 1; i <= 6; i++) {
            await provider.setEdgeSecret('FRONTBASE_SECRETS_KEY', `ct-${i}`);
        }
        const versions = await provider.getSecretVersions('FRONTBASE_SECRETS_KEY');
        expect(versions.length).toBeLessThanOrEqual(6);
        // The newest 3 (4,5,6) must survive; the active (6) always survives.
        const surviving = versions.map((v) => v.version);
        expect(surviving).toContain(6);
        expect(surviving).not.toContain(1);
        expect(surviving).not.toContain(2);
    });

    it('deleteEdgeSecret also removes the version history', async () => {
        await provider.setEdgeSecret('FRONTBASE_GPU', 'a');
        await provider.setEdgeSecret('FRONTBASE_GPU', 'b');
        expect((await provider.getSecretVersions('FRONTBASE_GPU')).length).toBe(2);

        await provider.deleteEdgeSecret('FRONTBASE_GPU');

        expect(await provider.getEdgeSecret('FRONTBASE_GPU')).toBeNull();
        expect((await provider.getSecretVersions('FRONTBASE_GPU')).length).toBe(0);
    });

    it('getEdgeSecretDetail surfaces createdAt alongside ciphertext', async () => {
        await provider.setEdgeSecret('FRONTBASE_VECTOR', 'ct');
        const detail = await provider.getEdgeSecretDetail('FRONTBASE_VECTOR');
        expect(detail).not.toBeNull();
        expect(detail!.value).toBe('ct');
        expect(detail!.version).toBe(1);
        expect(typeof detail!.createdAt).toBe('string');
        expect(typeof detail!.updatedAt).toBe('string');
    });
});
