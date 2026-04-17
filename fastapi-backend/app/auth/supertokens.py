import os
from supertokens_python import init, InputAppInfo, SupertokensConfig
from supertokens_python.recipe import thirdpartyaccountlinking, emailpassword, session, dashboard
from supertokens_python.recipe.multitenancy import ServerlessMultiTenancyConfig

def init_supertokens():
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
            thirdpartyaccountlinking.init(
                providers=[
                    # Identity providers will be configured here dynamically per tenant
                ]
            ),
            emailpassword.init(),
            dashboard.init()
        ],
        mode="asgi"
    )
