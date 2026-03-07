# Next Session — Planning

> Work continuity file. Completed items are tracked in `progress.md` and `performance-optimization.md`.

**Last session**: 2026-03-07 — Refactoring & Testing Batch  
**Test coverage**: 129 pytest · 74+ edge vitest (9 files) · 10 frontend vitest = **213+ total**

---

## Priorities

### 1. Queue Trigger Node
- [ ] Add `queue_trigger` to `nodeSchemas/triggers.ts` with channel + filter config
- [ ] Add `/api/queue/:workflowId` route to edge runtime (push receiver)
- [ ] Register push callback URL on publish (QStash: create topic subscription)

### 2. Remaining Refactoring
- [ ] Split `FileBrowser/index.tsx` into subcomponents (818L) — see `performance-optimization.md` §5 #11

### 3. Remaining Tests
- [ ] `build_worker()` mocked integration tests (P1 edge case coverage)

### 4. Features (pick from BACKLOG.md)
- [ ] UI Event Trigger (`ui_event_trigger` node)
- [ ] Email node (Resend/SendGrid action)
- [ ] Execution history panel
