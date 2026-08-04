# Release canary template

Use only a dedicated Sheet containing non-confidential synthetic data. Never paste OAuth credentials, tokens, Sheet values, or Sheet titles into this record.

## Candidate

- Version:
- Git commit:
- MCPB filename:
- SHA-256:
- Claude Desktop version:
- Host OS and architecture:
- OAuth project ownership: tester-owned
- Evidence date and operator:

## Source and package

- [ ] Pull request merged by squash.
- [ ] Same-SHA merged-main CI passed macOS ARM64, macOS Intel, Windows ARM64, and Windows x64.
- [ ] Local bundle verification and tracked secret scan passed.
- [ ] Bundle checksum matches.

## Install and tool contract

- [ ] The MCPB installs through Claude Desktop without Terminal input.
- [ ] Display name and icon are correct.
- [ ] Exactly five tools are listed: `google_auth_status`, `connect_google`, `get_spreadsheet_metadata`, `read_sheet_sample`, and `read_sheet_ranges`.
- [ ] Stable and workshop/development bundle identities can coexist without collision.

## Real OAuth and Sheets

- [ ] Before connection, `google_auth_status` reports disconnected without leaking the credential path.
- [ ] `connect_google` opens the system browser and requests only `spreadsheets.readonly`.
- [ ] Cancelling consent returns a safe error and a second attempt can start.
- [ ] Successful consent returns to Claude and stores the token in the OS credential vault.
- [ ] `get_spreadsheet_metadata` succeeds without recording the Sheet title.
- [ ] `read_sheet_sample` returns the expected shape and bounds without recording cell values.
- [ ] `read_sheet_ranges` reads one and multiple explicit A1 ranges.
- [ ] A missing/forbidden Sheet, invalid range, oversized request, and network failure return safe actionable errors.

## Persistence and recovery

- [ ] Restart Claude Desktop and verify `google_auth_status` remains connected.
- [ ] Read the same synthetic Sheet after restart.
- [ ] Revoke access in Google Account and verify the next call requests reconnection.
- [ ] Reconnect successfully and verify reads recover.
- [ ] No credential, token, Sheet value, or Sheet title appears in Git, bundle contents, logs, screenshots, or CI artifacts.

## Disposition

- Result: PASS / FAIL
- Blocking defect or limitation:
- Rollback action:
- Release/tag approval:
