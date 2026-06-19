# Action Items — From the Owner

**Created:** 2026-06-20
**Purpose:** Everything that needs the owner's action to take the subscription/managed-tier work live.
These are inputs, deploy steps, and product decisions — not engineering tasks the code can do itself.

---

## 🔴 Urgent — the deployment is currently down

- [ ] **Trigger a rebuild / redeploy.** The app is unhealthy because the new schema-drift check
      halted startup (fixed in commit `5bf136f`). A rebuild applies the fix **and** runs migration
      `0049` (adds the missing `is_managed` column), bringing the app back up.
- [ ] **Confirm the deploy runs migrations *before* the app starts.** Logs show it does
      ("Running database migrations… → Starting application…"), but keep that ordering intact —
      with the new fail-fast check, the app refuses to start if the DB lags the code.
      (Emergency stopgap: set `FB_ALLOW_SCHEMA_DRIFT=1`.)

---

## 🟠 To switch on the fully-hosted Basic tier (the one real blocker)

- [ ] **Provide Frontbase's Cloudflare operator credentials** — set
      `FB_OPERATOR_CF_ACCOUNT_ID` + `FB_OPERATOR_CF_API_TOKEN`
      (token scoped to Workers / D1 / KV / R2 / Workers Domains). This is the one thing between
      "code-complete" and "Basic tier is live." Once provided, the managed Worker (engine) deploy
      is finished and the live end-to-end test runs.
- [ ] **Provide Upstash credentials** (only if the managed *queue* add-on is wanted) —
      `FB_OPERATOR_UPSTASH_EMAIL` + `FB_OPERATOR_UPSTASH_API_KEY`.
      (D1/KV/R2/domain all run on Cloudflare; only the queue uses Upstash.)
- [ ] **Tell us the Cloudflare zone** to use for managed custom domains
      (so `managed_domain` provisioning can attach hostnames).

---

## 🟡 Product decisions to confirm or override

- [ ] **Delete-project = "must be empty"** (no data loss, no force-cascade). OK — or add a
      "force-delete with cascade" option?
- [ ] **Per-project write threshold = editor** (viewers read-only on pages + workflows). OK?
- [ ] **Viewer scope on other resources** — should viewers also be blocked from editing variables,
      project settings, themes, etc.? (Today only pages + workflows enforce editor+.)
- [ ] **Read-access hardening priority** — currently write-enforced + project-list-filtered, but a
      crafted `X-Project-Id` header could let a member read a project they're not on. Close now, or
      treat as low-priority hardening?

---

## 🔵 Optional / separate feature

- [ ] **Workspace Agent (pydantic-ai)** — currently import-guarded but non-functional. Fixing it
      needs: correcting the `pydantic-ai>=1.81.0` pin (looks invalid) and `pip install`-ing it.
      Do now, or park? (Unrelated to the subscription work.)

---

## 📌 Deferred by earlier decision (decide when to unpause)

- [ ] **AppSumo code redemption** — ready to build on the existing `apply_plan` seam whenever you
      say go.
- [ ] **Payment gateway (Stripe etc.)** — plan changes stay admin-approved until billing is wired.

---

### TL;DR
1. Rebuild to recover the deploy.
2. Hand over the Cloudflare operator token to light up the managed Basic tier.
3. Tick off the four product-decision confirmations.

Everything else is already shipped or parked behind those.
