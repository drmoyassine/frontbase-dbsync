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
 * @param engineUrl String representing the backend URL of the engine
 * @returns Fully qualified origin (e.g. `https://myfrontbase.com` or `https://worker.dev`)
 */
export function resolveEngineOrigin(engineUrl: string | undefined | null): string {
  if (!engineUrl) return '';
  
  const urlWithProto = engineUrl.startsWith('http') ? engineUrl : `https://${engineUrl}`;
  
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
 * @param path The specific file/API path to append
 */
export function resolvePreviewUrl(engineUrl: string | undefined | null, path: string = ''): string {
  const origin = resolveEngineOrigin(engineUrl);
  if (!origin) return '';
  const cleanPath = path.replace(/^\//, ''); // Avoid double-slashes
  return cleanPath ? `${origin}/${cleanPath}` : origin;
}
