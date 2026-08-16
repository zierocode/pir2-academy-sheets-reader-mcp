# Testing and evidence

Evidence is recorded in separate layers. Passing an earlier layer does not prove a later one.

| Layer | Evidence |
|---|---|
| Source | TypeScript strict checks and unit, contract, integration, stdio, manifest, documentation, and secret-scan tests pass. |
| CI | Merge-result and merged-main jobs pass on macOS ARM64, macOS Intel, Windows ARM64, and Windows x64. |
| Packaged | The MCPB schema validates; the production-only archive stays below 10 MiB; allowlisted contents include all four native keyring variants; development packages are absent; SHA-256 matches; credential scan passes. |
| Released | A version tag matching `package.json` produces an attached `.mcpb` and `.mcpb.sha256` from merged main. |
| Installed | The exact release artifact installs and lists all six tools in Claude Desktop. |
| Live canary | Real learner-owned OAuth, OS-vault persistence, metadata/sample/range reads, restart, revoke/reconnect, and coexistence are exercised without exposing Sheet data. |

## Local maintainer checks

```sh
npm ci
npm run check
npm run build
npm run smoke
npm run audit:high
npm run audit:tooling
npm run scan:secrets
npm run bundle
npm run bundle:verify
```

`npm run check` includes pure stdio MCP client coverage for initialize, `tools/list`, and success/failure calls for the six tools. Real OAuth is intentionally opt-in and is not proof from source tests.

## Clean-machine boundary

Source CI proves Node and native dependency compatibility on the four target runners. Full learner E2E on clean UTM Windows ARM64 and Windows x64 images is a later cross-course gate before slide production. A physical Windows machine remains an optional final confidence check.
