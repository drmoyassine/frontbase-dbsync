# Client-Side Visitor Detection & Context Enhancement

**Last Updated:** 2026-01-18

This document outlines what visitor information can be detected client-side versus server-side, including well-known cookies that can provide additional user context. It tracks the implementation status of visitor context features.

---

## SSR vs Client-Side Detection Comparison

### ✅ **More Accurate Client-Side**

| Property | Browser API | SSR Availability | Implementation Framework |
|----------|-------------|------------------|--------------------------|
| **Timezone** | `Intl` API | ❌ | ✅ Implemented (via `visitor-tz` cookie) |
| **Screen Resolution** | `window.screen` | ❌ | Planned (`visitor-enhanced`) |
| **Color Scheme** | `matchMedia` | ❌ | Planned (`visitor-enhanced`) |
| **Connection Type** | `navigator.connection` | ❌ | Planned (`visitor-enhanced`) |
| **User Agent** | `navigator.userAgent` | ✅ Header | ✅ Header-based (Fallbacks ready) |

### ⚠️ **Better or Equal on SSR**

| Property | SSR Source | Client Alternative | Frontbase Implementation |
|----------|------------|-------------------|-------------------------|
| **IP Address** | `CF-Connecting-IP` / `X-Forwarded-For` | ❌ N/A | ✅ SSR Header |
| **Country** | `CF-IPCountry` | Permission-based | ✅ SSR Header + Intl Conversion (`KW` → `Kuwait`) |
| **City** | `cf.city` (Workers) | Permission-based | ✅ Hybrid: Workers or deduced from Timezone (`Asia/Kuwait` → `Kuwait`) |

---

## Current Frontbase Implementation Status

We have implemented a **Hybrid SSR + Client Context System**:

1.  **Server-Side (Base Layer)**:
    *   Extracts IP, Device, Browser, OS, Language from standard headers.
    *   Extracts Country Code from Cloudflare Proxy headers (`CF-IPCountry`).
    *   **Auto-Converts** Country Code to Full Name (e.g., `KW` -> `Kuwait`) using `Intl.DisplayNames`.
    *   **Deduces City** from Timezone if missing (e.g., `Asia/Kuwait` -> `Kuwait`).

2.  **Client-Side (Enhancement Layer - Partial)**:
    *   Supports `visitor-tz` cookie to override server timezone.
    *   Allows fully accurate Timezone and City detection on any VPS (even without Cloudflare Workers).

### What's Missing (Next Sprint)
We need to transition from the simple `visitor-tz` cookie to a comprehensive `visitor-enhanced` JSON cookie to capture:
- ❌ Screen resolution & Viewport size
- ❌ Color scheme preference (Dark/Light)
- ❌ Connection type (4G/WiFi)
- ❌ Analytics presence detection

---

## Future Sprint: Full Client Enhancement

**Goal:** Replace ad-hoc scripts with a standardized `visitor-enhancement.js` utility.

### 1. The Script (`/static/visitor-enhancement.js`)
This script will run on the first page load, gather all available context, and store it in a single, efficient JSON cookie.

```javascript
(function() {
    // Check if already enhanced this session to avoid unnecessary processing
    if (sessionStorage.getItem('visitor-enhanced')) return;

    const data = {
        // Essential Context
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        sd: `${screen.width}x${screen.height}`, // Screen Dimensions
        cs: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', // Color Scheme
        
        // Connectivity & device
        ct: navigator.connection?.effectiveType || 'unknown',
        te: 'ontouchstart' in window,
        
        // Contextual signals (boolean flags only)
        ga: !!getCookie('_ga'),   // Google Analytics present?
        fbp: !!getCookie('_fbp'), // FB Pixel present?
    };

    // Store compacted JSON to save cookie space
    document.cookie = `visitor-enhanced=${encodeURIComponent(JSON.stringify(data))}; path=/; max-age=31536000; SameSite=Lax`;
    
    // Set simplified flags for legacy support if needed
    document.cookie = `visitor-tz=${data.tz}; path=/; max-age=31536000; SameSite=Lax`; // KEEP THIS for backward compat
    
    sessionStorage.setItem('visitor-enhanced', '1');

    function getCookie(name) {
        return document.cookie.split('; ').find(row => row.startsWith(name + '='))?.split('=')[1];
    }
})();
```

### 2. Server-Side Integration (`context.ts`)
Update `buildVisitorContext` to unpack this JSON cookie:

```typescript
// Proposed logic for context.ts
const enhancedCookie = parseCookies(headers.get('Cookie')).['visitor-enhanced'];
let clientData = {};
try { clientData = JSON.parse(decodeURIComponent(enhancedCookie)); } catch {}

return {
    ...ssrContext,
    timezone: clientData.tz || ssrContext.timezone,
    screen: clientData.sd || 'unknown',
    theme: clientData.cs || 'light',
    // ... merge other properties
};
```

### 3. Privacy & Tracking Settings Integration
- Add a toggle in `Settings > Privacy` to "Enable Client-Side Context Enhancement".
- If disabled, the script should not run or set cookies.

---

## Privacy & Legal Considerations ⚠️

| Action | Legal Status | Policy |
|--------|-------------|-------|
| **Read your own cookies** | ✅ Allowed | Safe. First-party context. |
| **Detect third-party cookie presence** | ⚠️ Gray area | Use for internal context/debugging only. **Do not store/export values.** |
| **Store third-party cookie values** | ❌ Forbidden | Violates privacy laws. Never do this. |

**Best Practice:**
- Only store **first-party data** (our own cookies).
- Respect **GDPR consent** (check `requireCookieConsent` setting).
- The `visitor-enhanced` cookie is strictly for **UX personalization** (Timezone, Theme, Responsiveness), not tracking.

---

## References
- [Navigator API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator)
- [Intl.DisplayNames - MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames)
- [GDPR Cookie Compliance](https://gdpr.eu/cookies/)
