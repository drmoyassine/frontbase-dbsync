/**
 * WebSocket shim for Cloudflare Workers.
 * 
 * Replaces the Node.js `ws` package. CF Workers provide a native
 * `WebSocket` global, so we just re-export it.
 */
export const WebSocket = globalThis.WebSocket;
export default WebSocket;
