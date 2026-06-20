import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSuperTokens } from "./lib/supertokens";
import { initAnalytics } from "./lib/analytics";

// Initialize analytics + error reporting (cloud mode only, no-op in self-host).
// Must run before render so the Sentry/PostHog SDKs are ready to catch startup errors.
initAnalytics();

// Initialize SuperTokens session management (cloud mode only, no-op in self-host)
initSuperTokens();

createRoot(document.getElementById("root")!).render(<App />);
