# hyperclaw-marketplace — Backlog

Status: BACKLOG (not started)
Created: 2026-04-02
Stack: Next.js
Repo: hyperclaw-marketplace (to be created)

## What This Is

An AI agent marketplace where creators can sell their agents and clients can hire them. Creators upload agents (or let OpenClaw push them via a ClawHub skill). Clients browse, hire, and use agents. Platform takes 20%, creator keeps 80%. Sealed packages protect creator IP.

## Architecture

- **hyperclaw-marketplace** (new Next.js repo) — storefront, creator portal, marketplace API
- **ClawHub** (existing OpenClaw infra) — agent hosting, skill upload, execution runtime
- **HyperClaw** (existing) — client-side integration only (hire + use)
- **OpenClaw skill** — lets creators publish agents to marketplace directly from their local setup

## Creator Paths

1. **Web upload** — create/upload agents through marketplace web UI
2. **OpenClaw skill** — install ClawHub skill locally, OpenClaw pushes agent to marketplace from creator's machine

## Todos

### Phase 1: Repo Setup + Sealed Package Format
- [ ] Create `hyperclaw-marketplace` repo (Next.js)
- [ ] Define sealed package spec (JSON manifest + encrypted config blob)
- [ ] Creator signup + profile page
- [ ] Agent upload API (accepts skill packages)
- [ ] Basic agent listing page
- [ ] Minimum viable cloud runtime (single LLM call, no tool use)
- [ ] 3 seed agents: Social Post Writer, Email Campaign Drafter, Blog Repurposer

### Phase 2: Client Marketplace + Billing
- [ ] Task-first discovery UI ("What do you need help with?")
- [ ] 5-step guided onboarding (business profile, task selection, voice/tone, channels/schedule, review/hire)
- [ ] Stripe Connect integration (marketplace payments, creator payouts)
- [ ] Decide client pricing: per-agent subscription ($29-$99/mo) or usage-based
- [ ] Post-hire dashboard (status, outputs, approve/reject, usage stats)
- [ ] Usage metering
- [ ] Creator testing sandbox
- [ ] Security review of proxy layer + sealed package access
- [ ] Progress persistence for onboarding (session-based, resume on return)

### Phase 3: Creator Tools + Flow Builder
- [ ] Visual drag-and-drop agent workflow editor (React Flow)
- [ ] Creator analytics dashboard
- [ ] Review/rating system for agents
- [ ] OpenClaw skill for publishing agents from local machine

### Phase 4: On-Device Execution
- [ ] Sealed package execution via HyperClaw connector
- [ ] Key management for on-device decryption
- [ ] Hybrid cloud/device execution routing

### HyperClaw Integration (after Phase 2)
- [ ] "Hire" page in HyperClaw dashboard (consumes marketplace API)
- [ ] Agent management page (view hired agents, usage, billing)
- [ ] Thin API layer in UserManager calling marketplace API

## Open Questions

1. Client pricing: per-agent subscription or usage-based?
2. Quality control: manual review vs. community reviews vs. automated testing?
3. Agent versioning: auto-update or pinned version on hire?
4. Proxy service language: Node.js or Go?

## Key Design Decisions

- **IP Protection:** Sealed packages (NaCl sealed boxes) encrypt agent configs at rest. Cloud-only execution in MVP means clients never have decryption keys.
- **UX:** "Hire an AI employee" as brand metaphor, but task-first UX (not browse-first). Clients start with "what do you need?" not scrolling profiles.
- **Monetization:** 20% platform fee on all transactions. Free tier: 3 agent listings. Pro ($29/mo): unlimited + priority placement.
- **Wedge:** Content/marketing agents first.

## Validation (before building)

Find 3 developers or agencies who build AI agents for clients. Ask: "If you could upload your agent to a marketplace where SMBs could hire it for $49/mo and you kept 80% — and your prompts/workflows stayed encrypted — would you list it?"

## Full Design Doc

See: ~/.gstack/projects/Hypercho-Inc-Hyperclaw_app/ziwenxu-feat_guided-onboarding-design-20260402-134348.md
