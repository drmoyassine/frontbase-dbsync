from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

class TestModeMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, test_mode=True):
        super().__init__(app)
        self.test_mode = test_mode

    async def dispatch(self, request: Request, call_next):
        # Add test mode header to response
        response = await call_next(request)
        response.headers["X-Test-Mode"] = str(self.test_mode)
        return response