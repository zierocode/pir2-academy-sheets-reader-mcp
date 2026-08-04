# Repository agent contract

## Scope

This is the public TypeScript ESM repository for the PiR2 Academy Sheets Reader local MCP.

## Required commands

```sh
npm ci
npm test
npm run build
npm run check
make smoke
```

## Non-negotiable boundaries

- Support Node.js 20 or later.
- Keep stdout exclusively for MCP JSON-RPC output; write diagnostics only to stderr.
- Keep changes read-only in data behavior unless an approved task changes that boundary.
- Do not commit secrets, learner data, course-only content, or generated bundles.
- Keep work portable across macOS and Windows; avoid platform-specific runtime assumptions.

## Change method

- Read the approved task before editing and stay within its named files.
- Add or update focused tests before production behavior changes.
- Run the task's focused checks plus `npm run check` before committing.
