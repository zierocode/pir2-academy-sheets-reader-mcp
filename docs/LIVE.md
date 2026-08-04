# Live release evidence

Evidence layers are deliberately separate. A passed source or CI layer does not imply that installation, OAuth, or a real Sheet call works.

## Release candidate 0.1.0

| Layer | Status | Evidence |
|---|---|---|
| Source | PASS | Merged main commit `49e8ec02a697bda85afc0307f12fb1b9c1b1b829`; 118 tests passed locally with one opt-in real canary skipped; lint, typecheck, build, smoke, audits, and secret scan passed. |
| Merge-result CI | PASS | Pull request #12 run `30932413904`; macOS ARM64, macOS Intel, Windows ARM64, and Windows x64 passed. |
| Merged-main CI | PASS | Push run `30933114823` for exact SHA `49e8ec02a697bda85afc0307f12fb1b9c1b1b829`; all four target jobs passed. |
| Packaged | PASS | `pir2-academy-sheets-reader-0.1.0.mcpb` built and verified locally with matching SHA-256; bundle allowlist, native keyring variants, and credential scan passed. |
| Installed | PENDING | Waiting for Claude Desktop host installation canary. |
| Live OAuth and Sheets | PENDING | Waiting for explicit Google consent and synthetic-Sheet canary. |
| Released | PENDING | No `v0.1.0` tag or GitHub Release until installed/live evidence passes. |

No Sheet title, cell value, OAuth credential, or token is recorded in this file.
