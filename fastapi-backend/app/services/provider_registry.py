"""
Provider Registry — Shared provider metadata for engine URL construction.

Single source of truth for provider labels, config key names, and URL templates.
Used by edge_engines router (deploy) and potentially other services.

Adding a new provider:
  1. Add label to PROVIDER_LABELS
  2. Add config key to PROVIDER_CONFIG_KEY
  3. Add URL builder case to build_engine_url()
"""


# =============================================================================
# Provider Display Labels
# =============================================================================

PROVIDER_LABELS: dict[str, str] = {
    "cloudflare": "Cloudflare",
    "supabase": "Supabase",
    "vercel": "Vercel",
    "netlify": "Netlify",
    "deno": "Deno Deploy",
    "upstash": "Upstash",
}


# =============================================================================
# Engine Config Key — stored in engine_config JSON
# =============================================================================

PROVIDER_CONFIG_KEY: dict[str, str] = {
    "cloudflare": "worker_name",
    "supabase": "function_name",
    "vercel": "project_name",
    "netlify": "site_name",
    "deno": "project_name",
    "upstash": "resource_name",
}


# =============================================================================
# URL Builders
# =============================================================================

# URL templates by provider type.
# {name} is replaced with the worker/function/project name.
_URL_TEMPLATES: dict[str, str] = {
    "cloudflare": "https://{name}.workers.dev",
    "supabase":   "https://{ref}.supabase.co/functions/v1/{name}",
    "vercel":     "https://{name}.vercel.app",
    "netlify":    "https://{name}.netlify.app",
    "deno":       "https://{name}.deno.dev",
    "upstash":    "https://{name}.upstash.app",
}


def build_engine_url(provider_type: str, creds: dict, worker_name: str) -> str:
    """Construct the public URL for a deployed engine by provider type.

    For providers where the URL isn't known until after deploy (e.g. Vercel),
    a predictable URL is constructed and may be updated after deploy.
    """
    if provider_type == "supabase":
        project_ref = creds.get("project_ref", "")
        return f"https://{project_ref}.supabase.co/functions/v1/{worker_name}"

    template = _URL_TEMPLATES.get(provider_type)
    if template:
        return template.format(name=worker_name, ref=creds.get("project_ref", ""))

    return f"https://{worker_name}"
