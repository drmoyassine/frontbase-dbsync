"""
SuperTokens SDK initialization — Cloud mode only.

All imports are inside the function body so that importing this module
is safe even when supertokens-python is not installed (self-host).
"""
import os


def init_supertokens():
    from supertokens_python import init, InputAppInfo, SupertokensConfig
    from supertokens_python.recipe import emailpassword, thirdparty, session, dashboard

    api_base_url = os.environ.get("BACKEND_URL", "http://localhost:8000")
    website_base_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    supertokens_uri = os.environ.get("SUPERTOKENS_URI", "http://supertokens:3567")
    api_key = os.environ.get("SUPERTOKENS_API_KEY", "dev-secret-key")

    init(
        app_info=InputAppInfo(
            app_name="Frontbase Cloud",
            api_domain=api_base_url,
            website_domain=website_base_url,
            api_base_path="/api/auth",
            website_base_path="/auth"
        ),
        supertokens_config=SupertokensConfig(
            connection_uri=supertokens_uri,
            api_key=api_key
        ),
        framework='fastapi',
        recipe_list=[
            session.init(),
            emailpassword.init(),
            thirdparty.init(
                sign_in_and_up_feature=thirdparty.SignInAndUpFeature(providers=[
                    # Providers configured dynamically per tenant
                ])
            ),
            dashboard.init()
        ],
        mode="asgi"
    )
