# Frontbase Backlog

## Performance
- [ ] **Replace Tailwind CDN with build-time CSS generation** — Currently SSR pages load `cdn.tailwindcss.com` (~300KB JS) for runtime class compilation. Replace with Tailwind CLI at publish time: scan `layoutData` component classes → generate static CSS → inject as `cssBundle`. Eliminates external dependency, console warning, and ~300KB load per page.
