import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSuperTokens } from "./lib/supertokens";

// Initialize SuperTokens session management (cloud mode only, no-op in self-host)
initSuperTokens();

createRoot(document.getElementById("root")!).render(<App />);
