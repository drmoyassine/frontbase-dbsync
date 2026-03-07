/**
 * Deno global type declarations for Deno-runtime adapters.
 * 
 * These adapters (supabase-edge, netlify-edge, deno-deploy) target the
 * Deno runtime and use Deno.serve(). This file suppresses TypeScript
 * errors in the IDE — the actual Deno types are available at runtime.
 */

declare namespace Deno {
    function serve(handler: (req: Request) => Response | Promise<Response>): void;
}
