import {
  cacheProvider
} from "./chunk-TIUQQ77S.js";

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
