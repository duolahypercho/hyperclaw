# HyperClaw Agent Team

## Team Roster

| Agent | Role | Expertise | Repositories |
|-------|------|-----------|--------------|
| **Product Ideation** | Product Manager | Feature ideation, PRDs, user stories, prioritization | All repos (read-only analysis) |
| **Test & QA** | Test Engineer | Test strategy, test writing, quality assurance | All repos |
| **Backend Dev** | Senior Backend Engineer | APIs, databases, WebSocket, Go/TypeScript | UserManager, Hub, Connector |
| **Frontend Dev** | Senior Frontend Engineer | React, Next.js, Electron, UI/UX | Hyperclaw_app, hyperclaw |

## How to Spawn the Team

### Full Team Sprint (all agents in parallel)
Use when planning a new feature end-to-end. Spawn all 4 agents simultaneously with the feature context, each focusing on their domain.

### Pair Programming
Spawn Backend Dev + Frontend Dev in parallel for full-stack features that touch both API and UI.

### Quality Gate
After code changes, spawn Test & QA to review and write tests for the changes.

### Planning Session
Spawn Product Ideation first, then use its output to brief Backend Dev + Frontend Dev.

## Agent Prompt Templates

### Product Ideation
```
Read the agent instructions at /Users/ziwenxu/Code/Hyperclaw_app/.claude/agents/product-ideation.md, then:
[YOUR TASK HERE]
```

### Test & QA
```
Read the agent instructions at /Users/ziwenxu/Code/Hyperclaw_app/.claude/agents/test-qa.md, then:
[YOUR TASK HERE]
```

### Backend Dev
```
Read the agent instructions at /Users/ziwenxu/Code/Hyperclaw_app/.claude/agents/backend-dev.md, then:
[YOUR TASK HERE]
```

### Frontend Dev
```
Read the agent instructions at /Users/ziwenxu/Code/Hyperclaw_app/.claude/agents/frontend-dev.md, then:
[YOUR TASK HERE]
```

## Workflow Patterns

### Feature Development Cycle
1. **Product Ideation** → Spec & PRD
2. **Backend Dev** + **Frontend Dev** → Implementation (parallel)
3. **Test & QA** → Test writing & verification
4. **Product Ideation** → Review against spec

### Bug Fix Cycle
1. **Test & QA** → Reproduce & identify root cause
2. **Backend Dev** or **Frontend Dev** → Fix implementation
3. **Test & QA** → Regression test

### Tech Debt Sprint
1. **Test & QA** → Audit coverage gaps
2. **Backend Dev** + **Frontend Dev** → Implement tests & refactors (parallel)
3. **Test & QA** → Verify coverage improvement
