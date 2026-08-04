# Privacy and data boundaries

## What stays local

- The MCP server runs as a local Claude Desktop process on the learner's computer.
- The OAuth client JSON stays at the local path selected during installation.
- Refresh tokens are stored in macOS Keychain or Windows Credential Manager under the service `pir2-academy-sheets-reader-mcp`.
- There is no PiR remote MCP server and no PiR-hosted OAuth broker.

## Google permission

The connector requests only the read-only scope `https://www.googleapis.com/auth/spreadsheets.readonly`. It has no write tool and cannot change Sheet values, formatting, sharing, or ownership.

Google defines this scope as permission to see all Google Sheets accessible to the authorized account; OAuth cannot narrow it to one Sheet. To reduce accidental exposure, the MCP does not list Drive files and reads values only after an explicit Sheet URL or spreadsheet ID is supplied. Read requests also enforce range, cell, row, column, byte, and response limits.

## What leaves the computer

OAuth and Sheets API requests go directly from the local MCP to Google. Sheet values selected by a tool call are returned to Claude as conversation tool results, so Claude and the applicable Anthropic service terms are part of the data boundary. Do not use confidential, regulated, or client data unless your organization has approved that use.

The MCP does not intentionally log credentials, OAuth tokens, Sheet titles, or Sheet values. CI and release bundles contain no learner credential file.

## Revoke access

You remain in control of the Google project and account. To revoke the connection, open your Google Account's third-party connections page, select your Sheets Reader app, and remove access. Google then rejects the stored token. You can also delete the matching local credential entry from Keychain Access or Windows Credential Manager.

Removing the Claude Desktop extension stops the MCP from running but does not itself revoke Google's authorization.
