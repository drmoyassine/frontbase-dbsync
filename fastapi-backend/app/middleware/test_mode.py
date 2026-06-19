from starlette.datastructures import MutableHeaders


class TestModeMiddleware:
    """Pure-ASGI middleware that stamps an X-Test-Mode header on every response.

    Deliberately NOT a BaseHTTPMiddleware: each BaseHTTPMiddleware wraps the
    response in a body-buffering task group, and two of them nested around a
    StreamingResponse (e.g. /api/agent/chat) collide on the stream's disconnect
    listener, crashing with "RuntimeError: Unexpected message received:
    http.request". Keeping this pure-ASGI leaves waf_middleware as the only
    BaseHTTPMiddleware in the stack.
    """

    def __init__(self, app, test_mode=True):
        self.app = app
        self.test_mode = test_mode

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        test_mode_value = str(self.test_mode)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Test-Mode"] = test_mode_value
            await send(message)

        await self.app(scope, receive, send_wrapper)
