# Known Bugs

## Form SSR — "No schema available"
- **Where**: Edge SSR rendering of Form component
- **Error**: `No schema available for "activities". Try re-publishing the page.`
- **Cause**: Column schema not baked into Form binding/props during publish. `publish_serializer.py` L138-140 calls `get_table_columns(ds_id, table_name)` but `ds_id` or `table_name` may not resolve for Form components.
- **Impact**: Forms render empty in SSR

## InfoList SPA — Infinite Loading
- **Where**: InfoList component in builder (SPA)
- **Symptom**: Skeleton loading state never resolves
- **Cause**: Data fetch likely hangs or returns unexpected format
- **Impact**: InfoList component is non-functional in builder preview

## DataTable SSR — CSS Mismatch
- **Where**: DataTable rendered on Edge SSR (`localhost:3002/test`)
- **Symptom**: Table renders but styling doesn't match the SPA builder preview
- **Cause**: CSS bundle published with page doesn't fully replicate SPA styles for DataTable
- **Impact**: Visual inconsistency between build-time and runtime

## Vercel Deploy — No Production Deployment
- **Where**: Vercel Edge Functions deploy (`/api/edge-engines/deploy`)
- **Symptom**: Deployment is created successfully (200) but Vercel dashboard shows "No Production Deployment" and the deployment URL returns 404 DEPLOYMENT_NOT_FOUND
- **Cause**: The Vercel v13 deployments API creates a deployment but may not promote it to production or the `target: "production"` field is missing
- **Impact**: Deployed edge function is unreachable via production URL

## Supabase Edge — Deploy Request Failure
- **Where**: Supabase Edge Functions deploy
- **Symptom**: Deploy request appears on Supabase dashboard but shows as failed
- **Cause**: Likely a payload format or API version mismatch in the deploy request
- **Impact**: Bundle deploys but the function may not be reachable via the expected URL

## Deno Deploy — APP_NOT_FOUND
- **Where**: Deno Deploy engine deploy (`/api/edge-engines/deploy`)
- **Symptom**: `{"code":"APP_NOT_FOUND","message":"The requested app was not found, or you do not have access to view it."}`
- **Cause**: `ensure_app_exists()` may be creating the app under a different org scope, or the v2 API `POST /apps` requires an `orgId` param that isn't being passed. The token is org-scoped but the app creation may still need explicit org binding.
- **Impact**: Deno Deploy engines cannot be deployed

## Upstash Workflows — Engine Unreachable
- **Where**: Upstash Workflows engine deploy (`/api/edge-engines/deploy`)
- **Symptom**: `Upstash engine unreachable: 404` → 503 Service Unavailable
- **Cause**: The Upstash deploy flow assumes a running engine at `engine.url` and POSTs to `/api/update`. For first deploys, there is no running engine yet — the workflow needs to be created first via the Upstash Workflows API, not via a Docker-like POST update.
- **Impact**: Upstash Workflows engines cannot be deployed

## Netlify Deploy — Subdomain Must Be Unique
- **Where**: Netlify engine deploy auto-site-creation (`/api/edge-engines/deploy`)
- **Symptom**: `{"errors":{"subdomain":["must be unique"]}}` → 400 Bad Request
- **Cause**: `create_site()` uses a fixed name `frontbase-edge` which may already exist globally on Netlify. Needs unique suffix (uuid or timestamp) or retry with fallback name.
- **Impact**: Netlify engines cannot be deployed if site name is taken
