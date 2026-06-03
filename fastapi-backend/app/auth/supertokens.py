"""
SuperTokens SDK initialization — Cloud mode only.

All imports are inside the function body so that importing this module
is safe even when supertokens-python is not installed (self-host).
"""
import os


def init_supertokens():
    from supertokens_python import init, InputAppInfo, SupertokensConfig
    from supertokens_python.recipe import (
        emailpassword,
        thirdparty,
        session,
        dashboard,
        usermetadata,
    )
    from supertokens_python.recipe.emailpassword.interfaces import APIInterface

    api_base_url = os.environ.get("BACKEND_URL", "http://localhost:8000")
    website_base_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    supertokens_uri = os.environ.get("SUPERTOKENS_URI", "http://supertokens:3567")
    api_key = os.environ.get("SUPERTOKENS_API_KEY", "frontbase-dev-secret-key-change-me")

    # ── Override: disable built-in sign-up endpoint ─────────────────────
    # We use a custom POST /api/auth/signup endpoint in auth.py that
    # calls emailpassword.sign_up() internally + provisions a Tenant.
    def override_emailpassword_apis(original: APIInterface) -> APIInterface:
        original.disable_sign_up_post = True
        return original

    # ── Override: capture session creation to record last login ──────────
    from supertokens_python.recipe.session.interfaces import RecipeInterface as SessionRecipeInterface
    from supertokens_python.recipe.session import SessionContainer
    from supertokens_python.types import RecipeUserId
    from typing import Optional, Dict, Any

    def override_session_functions(original: SessionRecipeInterface) -> SessionRecipeInterface:
        original_create_new_session = original.create_new_session
        
        async def create_new_session(
            user_id: str,
            recipe_user_id: RecipeUserId,
            *args: Any,
            **kwargs: Any,
        ) -> SessionContainer:
            # Update user's last login in the DB (cloud only)
            from app.database.config import SessionLocal
            from app.models.auth import User
            from datetime import datetime

            db = SessionLocal()
            try:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    user.last_login_at = datetime.utcnow().isoformat() + "Z"  # type: ignore[assignment]
                    db.commit()
                    print(f"[SuperTokens Session Hook] Updated last_login_at for user {user_id}")
            except Exception as e:
                # Log error but do not block authentication/login flow
                print(f"[SuperTokens Session Hook] Failed to update last_login_at for user {user_id}: {e}")
            finally:
                db.close()
                
            return await original_create_new_session(
                user_id,
                recipe_user_id,
                *args,
                **kwargs
            )
            
        original.create_new_session = create_new_session
        return original

    # ── Custom Email Delivery (Dynamic fallback) ─────────────────────────
    # If platform email configuration is present, use our email_service.
    # Otherwise, do not set email_delivery so SuperTokens falls back to its 
    # default managed service out of the box.
    resend_api_key = os.getenv("RESEND_API_KEY")
    mailgun_api_key = os.getenv("MAILGUN_API_KEY")
    has_platform_email = bool(resend_api_key or (mailgun_api_key and os.getenv("MAILGUN_DOMAIN")))

    email_delivery_config = None
    if has_platform_email:
        from supertokens_python.ingredients.emaildelivery.types import EmailDeliveryConfig, EmailDeliveryInterface
        from supertokens_python.recipe.emailpassword.types import PasswordResetEmailTemplateVars
        from typing import Dict, Any
        
        class CustomEmailpasswordDelivery(EmailDeliveryInterface[PasswordResetEmailTemplateVars]):
            async def send_email(self, template_vars: PasswordResetEmailTemplateVars, user_context: Dict[str, Any]) -> None:
                from app.services.email_service import send_email
                to_email = template_vars.user.email
                reset_link = template_vars.password_reset_link
                
                subject = "Reset your Frontbase password"
                html = f"""
                <p>Hello,</p>
                <p>We received a request to reset your password for Frontbase.</p>
                <p>Click the link below to set a new password:</p>
                <p><a href="{reset_link}">{reset_link}</a></p>
                <p>If you didn't request this, you can safely ignore this email.</p>
                """
                
                res = await send_email(
                    to=to_email,
                    subject=subject,
                    html=html
                )
                if not res.success:
                    raise Exception(f"Failed to send password reset email: {res.error}")
                    
        email_delivery_config = EmailDeliveryConfig(
            service=CustomEmailpasswordDelivery()
        )

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
            session.init(
                override=session.InputOverrideConfig(
                    functions=override_session_functions
                )
            ),
            emailpassword.init(
                override=emailpassword.InputOverrideConfig(
                    apis=override_emailpassword_apis,
                ),
                email_delivery=email_delivery_config,
            ),
            thirdparty.init(
                sign_in_and_up_feature=thirdparty.SignInAndUpFeature(providers=[
                    # Providers configured dynamically per tenant
                ])
            ),
            usermetadata.init(),
            dashboard.init(),
        ],
        mode="asgi"
    )
