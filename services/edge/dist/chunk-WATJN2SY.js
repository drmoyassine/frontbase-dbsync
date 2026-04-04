import {
  cacheProvider
} from "./chunk-TNITJ7W3.js";

// src/engine/debounce.ts
async function shouldDebounce(workflowId, windowSeconds = 0) {
  if (windowSeconds <= 0) return false;
  try {
    const key = `wf:${workflowId}:debounce`;
    const existing = await cacheProvider.get(key);
    if (existing) {
      return true;
    }
    await cacheProvider.setex(key, windowSeconds, "1");
    return false;
  } catch {
    return false;
  }
}

export {
  shouldDebounce
};
