from starlette.routing import Match
from fastapi import FastAPI

class SlashNormalizationMiddleware:
    """
    Pure-ASGI middleware that intercepts requests lacking a trailing slash.
    If the application router contains an exact matching route WITH a trailing slash,
    this middleware rewrites the ASGI scope path to include the slash.
    
    This transparently bypasses FastAPI's default 307 Redirect behavior, 
    preventing Mixed Content (ERR_NETWORK) blocks behind SSL proxies.
    """
    def __init__(self, app, fastapi_app: FastAPI):
        self.app = app
        self.fastapi_app = fastapi_app

    async def __call__(self, scope, receive, send):
        # Only process standard HTTP requests
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
            
        path = scope.get("path", "")
        
        # Fast path: skip if it already has a trailing slash or isn't an API route
        if not path.endswith("/") and path.startswith("/api/"):
            # First, verify the original path doesn't already have an exact match.
            # If it does (e.g. a deliberately slashless route like /api/queue/health),
            # we should not rewrite it to a slashed version even if one existed.
            original_matched = False
            for route in getattr(self.fastapi_app, "routes", []):
                match, _ = route.matches(scope)
                if match == Match.FULL:
                    original_matched = True
                    break
            
            if not original_matched:
                # Original path missed. Check if adding a trailing slash matches.
                test_scope = dict(scope)
                test_scope["path"] = path + "/"
                if "raw_path" in scope:
                    test_scope["raw_path"] = scope["raw_path"] + b"/"
                    
                # Iterate through FastAPI's registered routes
                for route in getattr(self.fastapi_app, "routes", []):
                    match, _ = route.matches(test_scope)
                    if match == Match.FULL:
                        # An exact slashed route exists. Rewrite the actual scope.
                        scope["path"] = test_scope["path"]
                        if "raw_path" in scope:
                            scope["raw_path"] = test_scope["raw_path"]
                        break  # Stop matching once we rewrite
                    
        return await self.app(scope, receive, send)
