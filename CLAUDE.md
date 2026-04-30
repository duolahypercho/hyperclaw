# HyperClaw App

## Architecture: No Direct Electron IPC for AI Runtimes

All AI runtime communication (Claude Code, Codex, Hermes) routes through the Hub → Connector relay. The Electron main process does NOT spawn CLI processes. The connector daemon handles all CLI spawning locally and streams results back through WebSocket.

- `bridgeInvoke("claude-code-send", {...})` → Hub → Connector → `claude -p ...`
- Streaming events: `claude-code-stream` CustomEvents on the gateway WS
- Never add `ipcMain.handle("claude-code:*")` or `ipcMain.handle("codex:*")` to electron/main.js

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
