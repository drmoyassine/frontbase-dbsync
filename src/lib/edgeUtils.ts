/**
 * edgeUtils.ts
 * 
 * Centralized helpers for interacting with Edge Engine URLs and infrastructure logic.
 */

/**
 * Resolves the absolute browser-accessible URL for an Edge Engine.
 * 
 * Context: 
 * The `url` stored in the database for the Local Edge engine is typically
 * an internal Docker network address (e.g. `http://edge:3002`).
 * This is useless to the user's browser in a VPS environment.
 * 
 * - If the target is an internal hostname, and we are in production,
 *   we use `window.location.origin` (because Nginx proxies root to Edge).
 * - If the target is internal, but we are in dev (port 5173), we return the local URL.
 * - If it's an external cloud target (e.g., Vercel, CF), we resolve it natively.
 * 
 * @param isShared Whether the target engine is a shared community worker
 * @returns Fully qualified origin (e.g. `https://myfrontbase.com` or `https://worker.dev`)
 */
export function resolveEngineOrigin(engineUrl: string | undefined | null, isShared?: boolean, tenantSlug?: string): string {
  // If this is a shared community engine, the tenant's exact subdomain routing is what matters,
  // so we always use the current window's origin (e.g., tenant.frontbase.dev) rather than the raw worker domain.
  if (isShared) {
    if (tenantSlug) {
      const hostParts = window.location.hostname.split('.');
      if (hostParts.length >= 3 && window.location.hostname !== 'localhost') {
        // App is on app.frontbase.dev or another domain with subdomains, replace first
        hostParts[0] = tenantSlug;
        return `${window.location.protocol}//${hostParts.join('.')}${window.location.port ? ':' + window.location.port : ''}`;
      }
    }
    return window.location.origin;
  }

  if (!engineUrl) return '';
  
  const cleanUrl = engineUrl.trim();
  const urlWithProto = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
  
  try {
    const host = new URL(urlWithProto).hostname;
    // Basic heuristic: internal hostnames either don't have dots or are explicitly localhost
    const isInternal = !host.includes('.') || host === 'localhost' || host === '0.0.0.0';
    
    if (isInternal) {
      const isDev = window.location.port === '5173';
      return isDev ? urlWithProto.replace(/\/$/, '') : window.location.origin;
    }
    
    return urlWithProto.replace(/\/$/, '');
  } catch {
    return urlWithProto.replace(/\/$/, '');
  }
}

/**
 * Computes a full edge preview/webhook URL directly appended to the normalized origin.
 * 
 * @param engineUrl The raw Edge engine URL from the data model
 * @param isShared Whether the engine is a shared community worker
 */
export function resolvePreviewUrl(engineUrl: string | undefined | null, path: string = '', isShared?: boolean, tenantSlug?: string): string {
  const origin = resolveEngineOrigin(engineUrl, isShared, tenantSlug);
  if (!origin) return '';
  const cleanPath = path.replace(/^\//, ''); // Avoid double-slashes
  return cleanPath ? `${origin}/${cleanPath}` : origin;
}
