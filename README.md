Built for PiR2 Academy — Advanced Claude Cowork

# PiR2 Academy Sheets Reader MCP

A local, read-only connector that lets Claude Desktop read bounded data from Google Sheets through a Google project and Google account owned by the learner.

## What it does

The bundle exposes five stable tools:

- `google_auth_status` — check whether Google is connected.
- `connect_google` — open Google's consent page for read-only access.
- `get_spreadsheet_metadata` — read workbook and tab metadata.
- `read_sheet_sample` — inspect a small, bounded sample.
- `read_sheet_ranges` — read explicit, bounded A1 ranges.

It cannot edit, create, or delete a spreadsheet. It does not use a PiR shared Google app, service account, remote MCP server, or OAuth broker.

## Before class

1. Install the current Claude Desktop release on macOS or Windows.
2. Follow [Set up your own Google project](docs/setup-google-project.md) and download its Desktop OAuth JSON file.
3. Download the `.mcpb` and matching `.sha256` files from this repository's Releases page.

Company-managed Google accounts can block third-party OAuth apps. If your administrator does not allow the connection, prepare a personal Google account and a Sheet containing non-confidential practice data.

## Install in Claude Desktop

1. Open the downloaded `.mcpb` file.
2. Confirm **PiR2 Academy — Sheets Reader** in Claude Desktop.
3. When asked for **Google Desktop OAuth credentials**, choose the JSON file from your own Google project.
4. Start a new Claude conversation and ask: `Check Google Sheets connection`.
5. When Claude reports that Google is not connected, ask: `Connect Google` and complete Google's consent page in your browser.

The learner flow is the same on macOS and Windows. You do not need to use the Terminal. Keep the downloaded OAuth JSON private and do not upload it to chat, GitHub, Slack, or a shared drive.

## Use it

Give Claude a Google Sheet URL and ask it to inspect the workbook or read a specific range. The Live Dashboard lab adds a separate Dashboard Skill that interprets generic Sheet data and responds to the manual command `Refresh dashboard`.

Read [Privacy and data boundaries](docs/privacy.md) before using real business data. See [Troubleshooting](docs/troubleshooting.md) if connection or access fails.

## For maintainers

Architecture and verification are documented in [Architecture](docs/architecture.md) and [Testing and evidence](docs/TESTING.md).

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

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Report vulnerabilities through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
