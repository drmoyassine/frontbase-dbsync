
Product Requirements Document: Frontbase

Product Overview

Frontbase is an AI-assisted drag-and-drop (DND) UI builder that seamlessly integrates into both fresh and existing repositories. It automates component discovery, configuration, and live editing, powered by in-memory embeddings and on-demand LLMs for code/config suggestions. Frontbase dramatically accelerates full-stack web application prototyping and onboarding while preserving backwards compatibility.

Key Features

1. Plug-and-Play Installation
   - npm install frontbase in any repo.
   - Auto-detection: If repo is new, initializes a default Remix application; if not, recognizes and adapts to the existing framework, routes, and component conventions.
   - Zero config setup for rapid onboarding.

2. Automatic AI/Embedding Service Integration
   - Deploys and configures a SageMaker-based dual AI service on install:
     - Light embeddings model for semantic search, discovery, and indexing (e.g., IBM Granite, MiniLM).
     - Lightweight LLM (<1B params) spun up as-needed for code/config gist suggestions (e.g., GPT-Neo Small, CodeGen-350M) with one-click, per-session inference (restartable on SageMaker).
   - Ephemeral or persistent sessions as the user chooses.

3. OpenMemory Vector Store & Indexing
   - Installs and configures SQLite-based OpenMemory as the default local vector database for quick semantic lookup and session state.
   - Automates vectorization and indexing of code (components, routes, pages), database schemas, and data sources.

4. Repo Analysis and AI-Powered Learning Phase
   - Automatically scans project structure, learns and indexes:
     - UI components (React, Remix, etc.)
     - Routing logic and pages
     - Data sources, API contracts, and Drizzle ORM schemas
   - Classifies, annotates, and registers discovered elements in OpenMemory for instant retrieval and smart suggestions.

5. DND Enablement & UI Wrapping
   - Injects wrappers or hooks around detected components/pages for DND editing, property editing, and real-time configuration in the browser.
   - Ensures UI interactivity regardless of original codebase, with no functional regressions or breaking changes.

6. Framework Adaptation
   - Existing repo: Adapts to code conventions and preserves legacy code, utilizing the repo’s native framework and configuration wherever possible.
   - Fresh repo: Installs Remix and Drizzle ORM, wires up out-of-the-box CRUD and schema syncing.

7. Backwards Compatibility
   - All injected or wrapped elements remain 100% compatible; generated code and configs do not break or refactor original logic.
   - Safeguards: DND and AI features are opt-in and can be switched off while maintaining legacy function.

Technical Workflow

1. Install & Bootstrap
   - User runs npm install frontbase.
   - CLI detects repo type and triggers appropriate setup (AI, Remix, Drizzle, etc.).
2. AI Service Initialization
   - Programmatically deploys LLM and embeddings containers to SageMaker.
   - Secure keys/config managed and loaded locally via npm post-install hooks.
3. Repo Discovery & Indexing
   - Code and schema analysis with AST parsers.
   - Embeds indexed elements in OpenMemory; links components to DND/AI features.
4. Live AI Assistance
   - In DND/editor, user receives semantic search, config prompts, DND context, and optional generative code suggestions from the AI agent.
5. Framework & ORM Integration
   - Wraps detected routes/pages/components in DND-enhanced React wrappers.
   - If fresh, generates Remix scaffold with Drizzle ORM and database plumbing.

Key Non-Functional Requirements

- Performance: Local embeddings, memory-first storage, minimal cold-start via SageMaker for LLM/embeddings service.
- Privacy/Security: User code/models/data is never public by default; SageMaker sessions are private; Kaggle deployment set to private if used.
- Extensibility: Modular AI/embedding service, ability to swap or upgrade models/services.
- Compatibility: Strict no-breaking-changes guarantee to existing codebases.

Partial Feature Roadmap

- v1.0: Core npm install, AI service bootstrap, DND wrapping, OpenMemory, Remix/Drizzle scaffolding.
- v1.1: On-demand deployment scripts for Kaggle/SageMaker, codebase privacy enforcement, framework adapters.
- v1.2: Advanced config suggestions, multi-language support, team collaboration mode.

---

Gaps/Questions (Living Section)

- Automatic detection and full support for a wide variety of frameworks and custom setups.
- Fallback/local options if cloud GPU is unavailable or for fully offline use.
- Securing model/service credentials and managing session data securely.
- User/role management and audit trail for DND and config changes.
- Handling large monorepos and incremental re-indexing efficiently.
- Full support for TypeScript projects and monorepo toolchains.
- UI/UX for opting out/rollback of DND and AI features.
- Multi-language support beyond JavaScript/TypeScript
- Monitoring, analytics and error reporting for AI suggestions and DND actions.
- Accessibility and internationalization in the generated UI/editor.

