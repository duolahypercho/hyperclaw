## Summary

<!-- What changed and why? -->

## Validation Plan

- [ ] `npm run lint` (advisory while legacy lint debt is cleaned up)
- [ ] `npm run build` (if web/runtime code changed)
- [ ] `cd connector && go build -o hyperclaw-connector ./cmd` (if connector changed)
- [ ] Manual local-first smoke test (if user-facing)

## Checklist

- [ ] No secrets, tokens, personal paths, or debug logs committed.
- [ ] No hardcoded production URLs introduced.
- [ ] Community Edition still works without hub env vars.
- [ ] Docs and `.env.example` updated if behavior/config changed.
- [ ] Screenshots or recordings included for UI changes.

## Notes for Reviewers

<!-- Any risky areas, follow-up work, or migration notes? -->
