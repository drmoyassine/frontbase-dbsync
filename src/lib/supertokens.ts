import SuperTokens from "supertokens-auth-react";
import Session from "supertokens-auth-react/recipe/session";
import EmailPassword from "supertokens-auth-react/recipe/emailpassword";
import { isCloud } from "@/lib/edition";

export function initSuperTokens() {
  if (!isCloud()) return;

  const appInfo = {
    appName: "Frontbase",
    apiDomain: window.location.origin,
    websiteDomain: window.location.origin,
    apiBasePath: "/api/auth",
    websiteBasePath: "/login"
  };

  SuperTokens.init({
    appInfo,
    recipeList: [
      EmailPassword.init(),
      Session.init(),
    ],
  });
}
