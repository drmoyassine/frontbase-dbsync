import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // CF-22 P0/W2: raw axios is being phased out in favor of the generated,
    // contract-typed client (src/client + lib/api-client). New code must not
    // import axios directly; the legacy instance (services/api-service) and
    // the generated client runtime are the only sanctioned users. Escalate
    // "warn" -> "error" once the service migration completes.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/client/**", "src/services/api-service.ts", "src/lib/api-client.ts"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "axios",
              message:
                "Use the generated API client (@/client, configured in @/lib/api-client) instead of raw axios.",
            },
          ],
        },
      ],
    },
  },
);
