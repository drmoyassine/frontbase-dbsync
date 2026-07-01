import {
  init_storage,
  stateProvider
} from "./chunk-LMYJ5MDS.js";
import "./chunk-HX3ZZUXN.js";
import {
  decryptSecret,
  getVaultSystemKey,
  init_edgeSecrets
} from "./chunk-TBNZI2LZ.js";
import "./chunk-JFJ6MVIJ.js";
import {
  getSecretTier,
  init_env,
  prewarmTier2,
  resetConfig
} from "./chunk-5YJ43IHE.js";
import "./chunk-KFQGP6VL.js";

// src/startup/loadSecrets.ts
init_storage();
init_edgeSecrets();
init_env();
var BOOT_EXCLUDED = /* @__PURE__ */ new Set(["FRONTBASE_STATE_DB"]);
async function loadEdgeSecrets() {
  const systemKey = getVaultSystemKey();
  if (!systemKey) {
    console.log("[EdgeSecrets] No FRONTBASE_SYSTEM_KEY \u2014 local vault disabled");
    return;
  }
  if (typeof stateProvider.listEdgeSecrets !== "function") {
    console.log("[EdgeSecrets] State provider does not support the local vault \u2014 skipping");
    return;
  }
  let names;
  try {
    names = (await stateProvider.listEdgeSecrets()).map((s) => s.name);
  } catch (err) {
    console.error("[EdgeSecrets] Failed to read vault index:", err);
    return;
  }
  if (names.length === 0) {
    console.log("[EdgeSecrets] Vault empty \u2014 nothing to load");
    return;
  }
  let loaded = 0;
  let skipped = 0;
  let deferred = 0;
  const failed = [];
  for (const name of names) {
    if (BOOT_EXCLUDED.has(name)) {
      skipped++;
      continue;
    }
    if (process.env[name] !== void 0 && process.env[name] !== "") {
      skipped++;
      continue;
    }
    if (getSecretTier(name) === 3) {
      console.warn(`[EdgeSecrets] Tier-3 secret '${name}' found in vault \u2014 skipping (bootstrap/config only)`);
      skipped++;
      continue;
    }
    if (getSecretTier(name) !== 1) {
      deferred++;
      continue;
    }
    try {
      const row = await stateProvider.getEdgeSecret?.(name);
      if (!row) {
        skipped++;
        continue;
      }
      const plaintext = await decryptSecret(row.value, systemKey);
      process.env[name] = plaintext;
      loaded++;
    } catch (err) {
      failed.push(name);
      console.error(`[EdgeSecrets] Failed to load '${name}':`, err);
    }
  }
  resetConfig("all");
  console.log(
    `[EdgeSecrets] Loaded ${loaded} Tier-1 secret(s) from vault` + (deferred ? `, deferred ${deferred} Tier-2 (background prewarm)` : "") + (skipped ? `, skipped ${skipped} (env override / excluded / tier-3)` : "") + (failed.length ? `, failed: ${failed.join(", ")}` : "")
  );
  if (deferred > 0) {
    void prewarmTier2().catch((err) => {
      console.error("[EdgeSecrets] Tier-2 background prewarm failed:", err);
    });
  }
}
export {
  loadEdgeSecrets
};
