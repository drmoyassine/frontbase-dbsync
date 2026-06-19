# Subscription System — Delivery Report

**Date:** 2026-06-19
**Audience:** Product / Leadership
**Status:** Core system live and enforcing. One external blocker remains (see below).

---

## In plain terms

We built the complete **subscription and usage-limits system** for Frontbase — the
machinery that decides what each customer is allowed to do based on the plan they're on,
and that **automatically enforces those limits** in the background (no manual work needed
per customer). An admin can create and price plans, set their limits, and customers see
their plan, their usage, and can request upgrades or downgrades.

This is the foundation the upcoming AppSumo launch and future paid billing will sit on.

---

## ✅ What has been delivered (shipped, working)

### 1. Fully admin-configurable plans
- A dedicated admin screen lets the **master admin create and edit subscription plans**
  (Free, Basic, Pro, Enterprise), set their **prices**, marketing copy, and **per-plan
  limits** — with no code changes.
- Adjusting a plan (e.g., "Pro now allows 300 pages instead of 200") instantly applies to
  every customer on that plan.

### 2. Automatic limit enforcement ("behind the scenes")
- When a customer reaches a plan limit, the system **automatically blocks the action and
  shows an upgrade prompt** — across: pages, workflows, data sources, connected accounts,
  hosting engines, team seats, projects, **monthly publish/republish volume**, and **how
  long execution history is kept**.
- Works fairly and safely: downgrading never deletes a customer's work (extra projects
  become read-only until they upgrade again).
- Platform operators (master admin) and self-hosted installs bypass all limits.

### 3. Customer self-service
- A **"Plan & Usage" screen** shows each customer their current plan, how much of each
  limit they've used (with progress bars), and lets the workspace owner **request an
  upgrade or downgrade** (an admin approves — no payment system is wired up yet).

### 4. Team invites with per-project access
- Workspace owners can **invite teammates**, choose their role, and grant them access to
  **specific projects** (for customers running more than one project).

### 5. Multiple projects per workspace (paid plans)
- Paid customers can run **several projects (apps/sites) under one workspace** and switch
  between them from a dropdown in the header.
- Free customers get **one default project** and a simple, uncluttered view (no dropdown).

### 6. Public pricing page
- Plans can be displayed on a **marketing/pricing page** built inside Frontbase itself,
  automatically reflecting whatever the admin configured.

### 7. Fully-hosted "Basic" tier foundation
- The **data, permissions, and add-on framework** for a fully-managed Basic tier
  (from **$1.99/mo**, with optional add-ons like cache, message queue, and custom domain)
  is in place and ready to be switched on (see the blocker below).

### 8. Quality bar
- Automated test suite: **passing (224 tests)**.
- Code-quality and frontend build checks: **clean**.

---

## The plan lineup (as configured today)

| Plan | Price | Best for | Highlights |
|---|---|---|---|
| **Free** | $0 | Trying it out | 1 project, 10 pages, community hosting, public pages only |
| **Basic** *(fully hosted)* | from **$1.99/mo** + add-ons | Wants Pro features with zero setup | We host everything; private pages; 50 pages; managed add-ons |
| **Pro** | $29/mo | Growing teams (own infrastructure) | 3 projects, 200 pages, private pages, connect your own auth |
| **Enterprise** | Custom | Scale | Unlimited everything, priority support |

*All prices and limits are examples the admin can change at any time from the admin screen.*

---

## 🔴 What's left — BLOCKING (1 item)

**To turn on the fully-hosted Basic tier, we need Frontbase's own Cloudflare account.**

- The fully-hosted ("managed") Basic tier means **Frontbase spins up and runs the customer's
  server, database, and cache on their behalf** — so the customer does zero setup.
- The code for this is **written and ready**, but it can only actually create those resources
  using **Frontbase's own Cloudflare account and an access key**.
- **What we need from you:** provide a Cloudflare account (and an access token) that
  Frontbase will use to host Basic-tier customers. Once provided, we connect it, finish the
  final piece (auto-creating the customer's hosted "engine"), test it live, and Basic is
  open for business.
- **Impact of not having it:** everything else works; only the fully-hosted Basic tier can't
  actually provision customer infrastructure. All other plans (Free, Pro, Enterprise — where
  customers bring their own infrastructure) are unaffected and fully functional.

> This is the **only true blocker**, and it's an input from your side — not more
> development time.

---

## 🟡 What's left — NON-BLOCKING (can launch; follow-ups)

These are polish/secondary items. Launch can proceed without them:

- **Sharing data sources across projects — nicer UI:** the capability works today; a
  more polished point-and-click picker is pending.
- **A few hosted add-ons (custom-domain hosting, message queue) in the Basic tier:** the
  framework is in place; these specific add-ons are lower priority once the Cloudflare
  account is connected.
- **Minor refinements** to how hosted resources are auto-created and cleaned up.

---

## 📌 Deliberately deferred (by decision — not blocked)

These were intentionally left for later and are **not** part of "what's left" above:

- **AppSumo code redemption** — the flow where an AppSumo customer enters a code to unlock
  their plan. It will plug directly into the system we've built.
- **Payment gateway (e.g., Stripe)** — plan changes are **admin-approved** for now. Real
  billing will attach to the same approval points later.

---

## Summary at a glance

| Area | Status |
|---|---|
| Admin-configurable plans & limits | ✅ Live |
| Automatic limit enforcement | ✅ Live |
| Customer plan/usage view + upgrade/downgrade requests | ✅ Live |
| Team invites + per-project access | ✅ Live |
| Multiple projects per workspace | ✅ Live |
| Public pricing page | ✅ Live |
| Fully-hosted Basic tier | 🟡 Code ready — **blocked on Cloudflare account** |
| AppSumo redemption | 📌 Deferred (by decision) |
| Payment gateway | 📌 Deferred (by decision) |

**To go fully live with the hosted Basic tier:** provide a Frontbase Cloudflare account +
access token. Everything else is shipped and enforcing.
